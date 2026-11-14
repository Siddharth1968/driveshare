import { createHash } from 'node:crypto';
import { AppError } from './errors.js';

const contentTypes = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
} as const;
type ImageExtension = keyof typeof contentTypes;
const hostedImage = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}\.(jpg|png|webp)$/;

export const maxImageBytes = 5 * 1024 * 1024;
export const imageHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; sandbox",
};

export function cloudinaryImageStore(env = process.env) {
  const cloud = env.DRIVESHARE_CLOUDINARY_NAME?.trim();
  const apiKey = env.DRIVESHARE_CLOUDINARY_API_KEY?.trim();
  const apiSecret = env.DRIVESHARE_CLOUDINARY_API_SECRET?.trim();
  if (!cloud && !apiKey && !apiSecret && !(env.NODE_ENV === 'production' && env.RENDER === 'true'))
    return;
  if (!cloud || !/^[a-z0-9_-]+$/i.test(cloud) || !apiKey || !apiSecret)
    throw new Error(
      'Configure the Cloudinary cloud name, API key and API secret for hosted images.',
    );

  const uploadUrl = `https://api.cloudinary.com/v1_1/${cloud}/raw/upload`;
  const deliveryBase = `https://res.cloudinary.com/${cloud}/raw/upload/`;
  const requestOptions = () => ({
    signal: AbortSignal.timeout(20_000),
    redirect: 'error' as const,
  });

  return {
    async save(filename: string, bytes: Buffer, extension: ImageExtension) {
      // Raw storage keeps the original bytes and avoids the image processing pixel limit.
      const publicId = `driveshare-${filename}`;
      const params = {
        overwrite: 'false',
        public_id: publicId,
        timestamp: Math.floor(Date.now() / 1000).toString(),
      };
      const signedFields = Object.entries(params)
        .map(([key, value]) => key + '=' + value)
        .join('&');
      const signature = createHash('sha256')
        .update(signedFields + apiSecret)
        .digest('hex');
      const form = new FormData();
      for (const [key, value] of Object.entries(params)) form.set(key, value);
      form.set('api_key', apiKey);
      form.set('signature', signature);
      form.set(
        'file',
        new Blob([new Uint8Array(bytes)], { type: contentTypes[extension] }),
        filename,
      );

      try {
        const response = await fetch(uploadUrl, {
          ...requestOptions(),
          method: 'POST',
          body: form,
        });
        if (!response.ok) throw new Error('Image storage rejected the upload.');
        const saved = (await response.json()) as { public_id?: string; resource_type?: string };
        if (saved.public_id !== publicId || saved.resource_type !== 'raw')
          throw new Error('Unexpected image storage response.');
      } catch {
        throw new AppError(502, 'Image storage is temporarily unavailable. Try uploading again.');
      }
    },

    async read(filename: string) {
      const match = hostedImage.exec(filename);
      if (!match) return;
      const extension = match[1] as ImageExtension;
      try {
        const response = await fetch(`${deliveryBase}driveshare-${filename}`, requestOptions());
        if (response.status === 404) return;
        if (!response.ok || Number(response.headers.get('content-length')) > maxImageBytes)
          throw new Error('Image storage returned an invalid response.');
        const body = Buffer.from(await response.arrayBuffer());
        if (body.length > maxImageBytes) throw new Error('Stored image exceeds the upload limit.');
        return { body, contentType: contentTypes[extension] };
      } catch {
        throw new AppError(502, 'Image storage is temporarily unavailable.');
      }
    },
  };
}
