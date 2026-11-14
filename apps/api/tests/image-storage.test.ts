import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cloudinaryImageStore, maxImageBytes } from '../src/image-storage.js';

const environment = {
  DRIVESHARE_CLOUDINARY_NAME: 'fixture-cloud',
  DRIVESHARE_CLOUDINARY_API_KEY: 'fixture-key',
  DRIVESHARE_CLOUDINARY_API_SECRET: 'fixture-secret',
  NODE_ENV: 'production',
  RENDER: 'true',
};
const filename = 'f166df32-126a-4054-bf99-1c314da5741c.webp';
const publicId = 'driveshare-' + filename;
const bytes = Buffer.from('RIFF\x04\x00\x00\x00WEBP', 'latin1');

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('hosted parking image storage', () => {
  it('keeps disk storage available locally and requires all hosted settings on Render', () => {
    expect(cloudinaryImageStore({ NODE_ENV: 'development' })).toBeUndefined();
    expect(cloudinaryImageStore({ NODE_ENV: 'production' })).toBeUndefined();
    expect(() => cloudinaryImageStore({ NODE_ENV: 'production', RENDER: 'true' })).toThrow(
      'Configure the Cloudinary',
    );
    expect(() => cloudinaryImageStore({ DRIVESHARE_CLOUDINARY_NAME: 'fixture-cloud' })).toThrow(
      'Configure the Cloudinary',
    );
    expect(() =>
      cloudinaryImageStore({ ...environment, DRIVESHARE_CLOUDINARY_NAME: 'invalid/cloud' }),
    ).toThrow('Configure the Cloudinary');
  });

  it('uploads the original bytes with signed fields and no overwrite', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ public_id: publicId, resource_type: 'raw' }));
    vi.stubGlobal('fetch', request);
    await cloudinaryImageStore(environment)!.save(filename, bytes, 'webp');

    const [url, options] = request.mock.calls[0];
    expect(url).toBe('https://api.cloudinary.com/v1_1/fixture-cloud/raw/upload');
    expect(options).toMatchObject({ method: 'POST', redirect: 'error' });
    const form = options?.body as FormData;
    expect(form.get('api_key')).toBe('fixture-key');
    expect(form.get('public_id')).toBe(publicId);
    expect(form.get('overwrite')).toBe('false');
    expect(form.get('timestamp')).toBe('1700000000');
    const expected = createHash('sha256')
      .update(`overwrite=false&public_id=${publicId}&timestamp=1700000000fixture-secret`)
      .digest('hex');
    expect(form.get('signature')).toBe(expected);
    expect(form.get('api_secret')).toBeNull();
    const file = form.get('file') as File;
    expect(file.name).toBe(filename);
    expect(file.type).toBe('image/webp');
    expect(Buffer.from(await file.arrayBuffer())).toEqual(bytes);
  });

  it('retrieves raw bytes by UUID with the original image MIME type', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new Uint8Array(bytes), {
        headers: { 'Content-Type': 'application/octet-stream' },
      }),
    );
    vi.stubGlobal('fetch', request);
    expect(await cloudinaryImageStore(environment)!.read(filename)).toEqual({
      body: bytes,
      contentType: 'image/webp',
    });
    expect(request).toHaveBeenCalledWith(
      `https://res.cloudinary.com/fixture-cloud/raw/upload/${publicId}`,
      expect.objectContaining({ redirect: 'error' }),
    );
  });

  it('does not fetch non-generated paths and preserves a missing image response', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', request);
    const store = cloudinaryImageStore(environment)!;
    expect(await store.read('../hidden.webp')).toBeUndefined();
    expect(await store.read('logo.svg')).toBeUndefined();
    expect(request).not.toHaveBeenCalled();
    expect(await store.read(filename)).toBeUndefined();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('reports sanitized storage failures and rejects oversized CDN responses', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ error: 'upstream details' }, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(null, { headers: { 'Content-Length': String(maxImageBytes + 1) } }),
      );
    vi.stubGlobal('fetch', request);
    const store = cloudinaryImageStore(environment)!;
    await expect(store.save(filename, bytes, 'webp')).rejects.toMatchObject({
      status: 502,
      message: 'Image storage is temporarily unavailable. Try uploading again.',
    });
    await expect(store.read(filename)).rejects.toMatchObject({
      status: 502,
      message: 'Image storage is temporarily unavailable.',
    });
  });
});
