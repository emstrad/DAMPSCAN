/* Visit context and interaction tracking, shared by every page on both sites.
   Loaded before book.js, which depends on DS, track() and LEAD_ENDPOINT.

   Per site values come from window.DS_CONFIG, set inline just above the script
   tag, because a static page cannot read environment variables. Everything else
   here is identical across the two sites and used to be duplicated in both home
   pages, which is how the two copies started to drift apart. */
const DS_CFG = window.DS_CONFIG || {};

const LEAD_ENDPOINT = '/api/lead';

/* FormSubmit is called from the browser, not from our functions: it sits behind
   Cloudflare, which answers a server-to-server request with a bot challenge
   rather than sending the email. Changing this address needs a commit, since a
   static page cannot read environment variables. */
const NOTIFY_ENDPOINT = DS_CFG.notify || '';

/* ---------- Visit session and first-party attribution (no cookies) ----------
   One id per visit, held in sessionStorage so it dies with the tab. The partial
   and the complete post share it, which is how the two reconcile into one lead.
   Referrer and utm_* are captured on first load and kept for the whole visit, so
   an event fired later still knows where the visitor came from. */
const DS = (function visitContext(){
  const KEY = DS_CFG.sessionKey || 'dampscan-session';
  const ATTR = DS_CFG.attrKey || 'dampscan-attr';
  const newId = () => {
    try { return crypto.randomUUID(); } catch (e) {}
    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
      (c ^ Math.random() * 16 >> c / 4).toString(16));
  };
  let id = null, attr = null;
  try { id = sessionStorage.getItem(KEY); } catch (e) {}
  if (!id) {
    id = newId();
    try { sessionStorage.setItem(KEY, id); } catch (e) {}
  }
  try { attr = JSON.parse(sessionStorage.getItem(ATTR) || 'null'); } catch (e) {}
  if (!attr) {
    const utm = {};
    try {
      new URLSearchParams(location.search).forEach((v, k) => {
        if (/^(utm_|gclid|fbclid)/i.test(k)) utm[k.toLowerCase()] = v.slice(0, 120);
      });
    } catch (e) {}
    attr = { referrer: document.referrer || '', utm, landingPage: location.pathname + location.search };
    try { sessionStorage.setItem(ATTR, JSON.stringify(attr)); } catch (e) {}
  }
  return { id: id, referrer: attr.referrer, utm: attr.utm, landingPage: attr.landingPage };
})();

/* Fire and forget. Analytics must never slow the page or surface an error. */
function track(type, detail){
  try {
    fetch('/api/event', {
      method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: DS.id, type: type, detail: detail || {}, path: location.pathname,
        referrer: DS.referrer, utm: DS.utm, landingPage: DS.landingPage
      })
    }).catch(function(){});
  } catch (e) {}
}

/* Which part of the page an interaction came from. */
function placementOf(el){
  if (el.closest('.site-header')) return 'header';
  if (el.closest('.action-bar')) return 'mobile-bar';
  if (el.closest('.closing')) return 'closing';
  if (el.closest('.footer')) return 'footer';
  return 'page';
}

/* ---------- Interaction tracking (delegated, nothing added to the markup) ---------- */
(function tracking(){
  track('page_view');
  document.addEventListener('click', e => {
    const a = e.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (href.indexOf('tel:') === 0) track('call_click', { placement: placementOf(a) });
    else if (href.indexOf('mailto:') === 0) track('email_click', { placement: placementOf(a) });
    else if (href === '#book') track('cta_click', { placement: placementOf(a) });
  }, true);
})();
