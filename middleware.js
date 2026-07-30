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
    // cleanUrls is on, so the file is served at /london and the internal path
    // /london.html resolves to nothing. Rewriting to the extension-ful path
    // returns a 404 rather than the page.
    return rewrite(new URL('/london', request.url));
  }
  return next();
}
