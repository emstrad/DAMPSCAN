/**
 * Host-based routing for the two sites.
 *
 * vercel.json rewrites are evaluated AFTER the filesystem, so a rewrite on "/"
 * never fires: "/" already matches public/index.html and is served directly.
 * Middleware runs before the filesystem, which is why the London routing lives
 * here rather than in vercel.json.
 *
 * Scoped to "/" only. Every other path, /api, /staff, /assets, is shared by both
 * domains and must not be touched.
 */
import { rewrite, next } from '@vercel/edge';

export const config = { matcher: '/' };

const LONDON_HOST = /^(www\.)?atidampsurvey\.co\.uk$/i;

export default function middleware(request) {
  const host = (request.headers.get('host') || '').split(':')[0];
  if (LONDON_HOST.test(host)) {
    return rewrite(new URL('/london.html', request.url));
  }
  return next();
}
