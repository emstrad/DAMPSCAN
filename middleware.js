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
 *   3. Serve the hub, area, service and guide pages. /damp-survey, /services
 *      and /guides resolve to a hub, and /damp-survey/<slug>, /services/<slug>
 *      and /guides/<slug> to a detail page, all to a different file on each
 *      host, so both sites can use the same tidy URL shape.
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
    '/roofing-in', '/roofing-in/', '/roofing-in/:slug',
    '/services', '/services/', '/services/:slug',
    '/guides', '/guides/', '/guides/:slug',
    '/pricing', '/pricing/'
  ]
};

const LONDON_HOST = /^(www\.)?atidampsurvey\.co\.uk$/i;
const KENT_HOST = /^(www\.)?dampscan\.co\.uk$/i;

/**
 * Which brand a host is, and where that brand's pages live.
 *
 * This was two damp hosts and a boolean, and the boolean decided the directory:
 * anything that was not London was served DampScan. A third domain pointed at
 * this project would therefore have answered every one of its URLs with damp
 * content under a roofing canonical, which is the worst thing a shared project
 * can do to a new brand. Adding one here is now the whole change.
 *
 * `areas` is the public path the area pages sit under, because it is part of
 * the brand's language rather than a shared convention: damp says damp-survey,
 * roofing says roofing-in. A brand with no area pages yet leaves it null and
 * nothing routes there.
 *
 * `files` are the per brand root documents. DampScan is the project's default
 * and so owns the unprefixed ones; every other brand names its own.
 */
const SITES = {
  dampscan: { areas: '/damp-survey', files: {} },
  ati: {
    areas: '/damp-survey',
    files: {
      '/': '/london.html',
      '/robots.txt': '/robots-london.txt',
      '/sitemap.xml': '/sitemap-london.xml',
      '/llms.txt': '/llms-london.txt'
    }
  },
  /* No home page written yet, and no area pages. `home: false` is load bearing
     rather than documentation: public/index.html exists and is DampScan's, so
     without this a roofing visitor would be served a damp home page under a
     roofing domain. Refusing is the only honest answer until the page exists. */
  roofing: {
    areas: null,
    files: {
      '/robots.txt': '/robots-roofing.txt',
      '/sitemap.xml': '/sitemap-roofing.xml',
      '/llms.txt': '/llms-roofing.txt',
      '/': '/roofing.html'
    },
    home: true
  },
  ac: {
    areas: null,
    files: {
      '/robots.txt': '/robots-ac.txt',
      '/sitemap.xml': '/sitemap-ac.xml',
      '/llms.txt': '/llms-ac.txt',
      '/': '/ac.html'
    },
    home: true
  }
};

const HOSTS = [
  [LONDON_HOST, 'ati'],
  [KENT_HOST, 'dampscan'],
  [/^(www\.)?vergeroofing\.com$/i, 'roofing'],
  [/^(www\.)?coolright\.co\.uk$/i, 'ac']
];

/* Previews and the vercel.app hostnames have no brand of their own, so they
   fall back to the project's default rather than guessing from the URL. */
function siteFor(host) {
  for (const [pattern, key] of HOSTS) if (pattern.test(host)) return key;
  return 'dampscan';
}

export default function middleware(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  const host = (request.headers.get('host') || '').split(':')[0];
  const london = LONDON_HOST.test(host);
  const key = siteFor(host);
  const site = SITES[key];

  /* A brand whose home page has not been written does not borrow another's. */
  if (path === '/' && site.home === false) {
    return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  }

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
  const dir = key;

  // The hubs sit above the detail pages and are what the nav and the
  // breadcrumbs point at. vercel.json sets trailingSlash false, so the bare
  // path is canonical here too and the slashed form redirects onto it. Serving
  // the slashed form instead would fight that setting and loop.
  // Both practices publish now, and each host must resolve to its own fees.
  // Falling through to the other firm's page would show a Kent customer London
  // prices, which is the one mistake a pricing page cannot survive.
  if (path === '/pricing/') return Response.redirect(new URL('/pricing', url), 301);
  if (path === '/pricing') {
    /* A brand that quotes every job has no pricing page. Falling through is
       right: nothing serves it and the 404 is honest. */
    if (key === 'roofing') return next();
    return rewrite(new URL(london ? '/pricing/ati.html' : '/pricing/dampscan.html', request.url));
  }

  if (site.areas && path === `${site.areas}/`) return Response.redirect(new URL(site.areas, url), 301);
  if (path === '/services/') return Response.redirect(new URL('/services', url), 301);
  if (path === '/guides/') return Response.redirect(new URL('/guides', url), 301);
  if (site.areas && path === site.areas) return rewrite(new URL(`/hubs/${dir}/areas.html`, request.url));
  if (path === '/services') return rewrite(new URL(`/hubs/${dir}/services.html`, request.url));
  if (path === '/guides') return rewrite(new URL(`/hubs/${dir}/guides.html`, request.url));

  const area = site.areas && path.match(new RegExp(`^${site.areas}/([a-z0-9-]+)$`));
  if (area) return rewrite(new URL(`/areas/${dir}/${area[1]}.html`, request.url));

  const service = path.match(/^\/services\/([a-z0-9-]+)$/);
  if (service) return rewrite(new URL(`/service-pages/${dir}/${service[1]}.html`, request.url));

  const guide = path.match(/^\/guides\/([a-z0-9-]+)$/);
  if (guide) return rewrite(new URL(`/guide-pages/${dir}/${guide[1]}.html`, request.url));

  // cleanUrls is off, so the file path is the only path and this is
  // unambiguous. The browser still shows the original URL: this is a rewrite.
  const file = site.files[path];
  if (file) return rewrite(new URL(file, request.url));

  return next();
}
