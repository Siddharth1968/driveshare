import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { Request, Response, NextFunction } from 'express';
import type { User } from '@prisma/client';
import { db } from './db.js';
import { production, settings } from './config.js';
import { AppError, ensure } from './errors.js';
declare global {
  namespace Express {
    interface Request {
      user?: User;
      csrf?: string;
      showcase?: boolean;
    }
  }
}
export const publicUser = (u: User, showcase = false) => ({
  id: u.id,
  fullName: u.fullName,
  email: u.email,
  phone: u.phone,
  roles: u.roles,
  accountStatus: u.accountStatus,
  ...(showcase ? { showcase: true } : {}),
});
export async function issueSession(res: Response, user: User, showcase = false) {
  const csrf = randomUUID();
  const token = await new SignJWT({
    ver: user.sessionVersion,
    csrf,
    ...(showcase ? { showcase: true } : {}),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('12h')
    .setIssuer('driveshare')
    .setAudience('driveshare-web')
    .sign(settings.secret);
  res.cookie('driveshare_session', token, {
    httpOnly: true,
    secure: production,
    sameSite: 'lax',
    maxAge: 43200000,
    path: '/',
  });
  return csrf;
}
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies.driveshare_session;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, settings.secret, {
        algorithms: ['HS256'],
        issuer: 'driveshare',
        audience: 'driveshare-web',
      });
      const user = await db.user.findUnique({ where: { id: payload.sub } });
      if (user && user.accountStatus === 'ACTIVE' && user.sessionVersion === payload.ver) {
        req.user = user;
        req.csrf = String(payload.csrf);
        req.showcase = payload.showcase === true;
      }
    } catch {
      /* Invalid or expired cookies are treated as unauthenticated. */
    }
  }
  next();
}
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new AppError(401, 'Please sign in to continue.'));
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-csrf-token'] !== req.csrf)
    return next(new AppError(403, 'Security token expired. Refresh the page and try again.'));
  if (
    req.showcase &&
    !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
    req.path !== '/api/auth/logout'
  )
    return next(
      new AppError(403, 'Restricted admin demo is read-only to protect shared demonstration data.'),
    );
  next();
}
export const role = (name: string) => (req: Request, _res: Response, next: NextFunction) => {
  try {
    ensure(req.user?.roles.includes(name), 403, `${name.toLowerCase()} permission required.`);
    next();
  } catch (e) {
    next(e);
  }
};
