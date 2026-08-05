/**
 * Host-based routing for the two sites.
 *
 * vercel.json rewrites are evaluated AFTER the filesystem, so a rewrite on "/"
 * never fires: "/" already matches public/index.html and is served directly.
 * Middleware runs before the filesystem, which is why the London routing lives
 * here rather than in vercel.json.
 *
 * Two jobs:
 *   1. Serve the London site, and its own robots, sitemap and llms files, on
 *      the London host. These are rewrites, so the URL the visitor sees, and
 *      the URL Google indexes, stays clean.
 *   2. Keep one page on one URL. Both domains run off one Vercel project, so
 *      every file is reachable on both hosts. Without these redirects the ATi
 *      page also answers on dampscan.co.uk/london.html, which is a duplicate
 *      of the ATi home page on the wrong brand's domain.
 *   3. Serve the hub, area and service pages. /damp-survey/ and /services/
 *      resolve to a hub, and /damp-survey/<slug> and /services/<slug> to a
 *      detail page, all to a different file on each host, so both sites can use
 *      the same tidy URL shape.
 *
 * Everything else, /api, /staff, /assets, is shared by both domains and is not
 * matched here at all.
 */
import { rewrite, next } from '@vercel/edge';

export const config = {
  matcher: [
    '/', '/index.html', '/london.html',
    '/robots.txt', '/sitemap.xml', '/llms.txt',
    '/damp-survey', '/damp-survey/', '/damp-survey/:slug',
    '/services', '/services/', '/services/:slug'
  ]
};

const LONDON_HOST = /^(www\.)?atidampsurvey\.co\.uk$/i;
const KENT_HOST = /^(www\.)?dampscan\.co\.uk$/i;

const LONDON_FILES = {
  '/': '/london.html',
  '/robots.txt': '/robots-london.txt',
  '/sitemap.xml': '/sitemap-london.xml',
  '/llms.txt': '/llms-london.txt'
};

export default function middleware(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  const host = (request.headers.get('host') || '').split(':')[0];
  const london = LONDON_HOST.test(host);

  // index.html is the same document as "/", on every host including previews.
  if (path === '/index.html') {
    return Response.redirect(new URL(london ? 'https://dampscan.co.uk/' : '/', url), 301);
  }

  // The ATi page belongs on the ATi domain. On a preview deployment there is no
  // separate host to send it to, so it is left alone and served as a file.
  if (path === '/london.html') {
    if (london) return Response.redirect(new URL('/', url), 301);
    if (KENT_HOST.test(host)) return Response.redirect('https://atidampsurvey.co.uk/', 301);
    return next();
  }

  // Area pages. Both sites want the same public path, and one Vercel project
  // serves both domains, so the files live in per site directories and the host
  // picks which one answers. The visitor and Google only ever see
  // /damp-survey/<slug>, which is what the canonical on each page says.
  const dir = london ? 'ati' : 'dampscan';

  // The hubs sit above the detail pages and are what the nav and the
  // breadcrumbs point at. Canonical is the trailing slash form, so the bare
  // path redirects rather than serving the same page on two URLs.
  if (path === '/damp-survey') return Response.redirect(new URL('/damp-survey/', url), 301);
  if (path === '/services') return Response.redirect(new URL('/services/', url), 301);
  if (path === '/damp-survey/') return rewrite(new URL(`/hubs/${dir}/areas.html`, request.url));
  if (path === '/services/') return rewrite(new URL(`/hubs/${dir}/services.html`, request.url));

  const area = path.match(/^\/damp-survey\/([a-z0-9-]+)$/);
  if (area) return rewrite(new URL(`/areas/${dir}/${area[1]}.html`, request.url));

  const service = path.match(/^\/services\/([a-z0-9-]+)$/);
  if (service) return rewrite(new URL(`/service-pages/${dir}/${service[1]}.html`, request.url));

  if (london) {
    const file = LONDON_FILES[path];
    // cleanUrls is off, so the file path is the only path and this is
    // unambiguous. The browser still shows the original URL: this is a rewrite.
    if (file) return rewrite(new URL(file, request.url));
  }

  return next();
}
