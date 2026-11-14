/* Attachments seen on screen instead of downloaded (the owners' choice,
   11 Nov 2026): a pop-up over the page, swipe (or arrow) across the files,
   photos fitted to the screen, PDFs drawn page by page to scroll through
   (iPhones only show a PDF's first page otherwise), Download still there.
   Files are fetched with the page's own sign-in or link and shown from
   memory, so nothing a customer uploaded ever runs as a page of ours.
   Shared by the staff area and the customer's page. Plain DOM, no build step. */
(function (global) {
  'use strict';
  /* pdf.js only loads when a PDF is opened. Pinned, from the allowed CDN. */
  var PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  var WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  /* A modal dialog of its own, so it opens over the staff pop-up (also a modal
     dialog, which makes everything else on the page untouchable) and swipes there too. */
  var CSS = 'dialog.vw{border:0;padding:0;margin:0;width:100vw;max-width:none;max-height:none;overflow:hidden}.vw::backdrop{background:transparent}' +
    '.vw{position:fixed;inset:0;z-index:1000;background:#06090f;color:#f3f6fa;display:grid;grid-template-rows:auto 1fr;height:100dvh;font:15px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;animation:vw-in .16s ease-out}' +
    '.vw [hidden]{display:none}' +
    '@keyframes vw-in{from{opacity:0}to{opacity:1}}' +
    '.vw-bar{display:flex;align-items:center;gap:8px;padding:calc(8px + env(safe-area-inset-top)) max(10px,env(safe-area-inset-right)) 8px max(10px,env(safe-area-inset-left))}' +
    '.vw-name{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600}' +
    '.vw-count{font-size:.8rem;opacity:.7;white-space:nowrap}' +
    '.vw-b{min-width:44px;min-height:44px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:inherit;border-radius:12px;cursor:pointer;font:inherit;font-weight:600;padding:0 12px;display:inline-grid;place-items:center}' +
    '.vw-b:focus-visible{outline:3px solid #7cc3f5;outline-offset:2px}' +
    '.vw-track{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;overscroll-behavior:contain;scrollbar-width:none;min-height:0}' +
    '.vw-track::-webkit-scrollbar{display:none}' +
    '.vw-slide{flex:0 0 100%;scroll-snap-align:center;min-width:0;overflow:auto;display:grid;place-items:center;padding:0 max(8px,env(safe-area-inset-right)) env(safe-area-inset-bottom) max(8px,env(safe-area-inset-left))}' +
    '.vw-slide img{max-width:100%;max-height:calc(100dvh - 90px);object-fit:contain;border-radius:6px;touch-action:pinch-zoom}' +
    '.vw-pages{display:grid;gap:10px;justify-items:center;align-content:start;width:100%;padding:6px 0 24px;place-self:start center}' +
    '.vw-pages canvas{width:100%;max-width:900px;height:auto;background:#fff;border-radius:4px;box-shadow:0 6px 24px rgba(0,0,0,.4)}' +
    '.vw-msg{text-align:center;opacity:.85;display:grid;gap:12px;justify-items:center;padding:24px}' +
    '.vw-nav{position:fixed;top:50%;transform:translateY(-50%);z-index:1}' +
    '.vw-prev{left:max(8px,env(safe-area-inset-left))}.vw-next{right:max(8px,env(safe-area-inset-right))}' +
    '@media (hover:none){.vw-nav{display:none}}' +
    '@media (prefers-reduced-motion:reduce){.vw{animation:none}.vw-track{scroll-behavior:auto}}';
  var pdfReady = null, box = null, items = [], at = 0, urls = [], lastFocus = null;

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function loadPdf() {
    if (pdfReady) return pdfReady;
    pdfReady = new Promise(function (ok, no) {
      if (global.pdfjsLib) return ok(global.pdfjsLib);
      var s = document.createElement('script'); s.src = PDFJS; s.crossOrigin = 'anonymous';
      s.onload = function () { global.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER; ok(global.pdfjsLib); };
      s.onerror = function () { pdfReady = null; no(new Error('pdf')); };
      document.head.appendChild(s);
    });
    return pdfReady;
  }
  function style() { if (document.getElementById('vw-css')) return; var s = el('style'); s.id = 'vw-css'; s.textContent = CSS; document.head.appendChild(s); }

  /* Each item: {url, name} fetched when first shown, or {blob, name} already in hand. */
  function fetchBlob(it) {
    if (it.blob) return Promise.resolve(it.blob);
    return fetch(it.url, { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.blob(); }).then(function (b) { it.blob = b; return b; });
  }
  function urlFor(blob) { var u = URL.createObjectURL(blob); urls.push(u); return u; }
  function kindOf(it, blob) {
    var type = (blob && blob.type) || '', name = String(it.name || '').toLowerCase();
    if (/pdf/.test(type) || /\.pdf$/.test(name)) return 'pdf';
    if (/^image\//.test(type) || /\.(jpe?g|png|gif|webp|heic)$/.test(name)) return 'image';
    return 'other';
  }
  function message(slide, text, it) {
    slide.textContent = ''; var m = el('div', 'vw-msg'); m.appendChild(el('div', null, text));
    if (it) { var d = el('button', 'vw-b', 'Download'); d.type = 'button'; d.addEventListener('click', function () { download(it); }); m.appendChild(d); }
    slide.appendChild(m);
  }
  function fill(i) {
    var it = items[i], slide = box && box.querySelectorAll('.vw-slide')[i];
    if (!slide || slide.dataset.done) return;
    slide.dataset.done = '1';
    message(slide, 'Loading\u2026');
    fetchBlob(it).then(function (blob) {
      var kind = kindOf(it, blob);
      if (kind === 'image') { slide.textContent = ''; var img = el('img'); img.alt = it.name || 'Attachment'; img.src = urlFor(blob); slide.appendChild(img); return; }
      if (kind !== 'pdf') { message(slide, it.name || 'This file can\'t be shown here.', it); return; }
      return loadPdf().then(function (lib) { return blob.arrayBuffer().then(function (buf) { return lib.getDocument({ data: buf }).promise; }); }).then(function (doc) {
        slide.textContent = ''; var pages = el('div', 'vw-pages'); slide.appendChild(pages);
        var width = Math.min(slide.clientWidth || 360, 900), ratio = Math.min(global.devicePixelRatio || 1, 2), n = 0;
        /* Pages are drawn in order, a few at a time, so the first shows at once. */
        (function next() {
          n += 1; if (n > doc.numPages || !box) return;
          doc.getPage(n).then(function (page) {
            var v = page.getViewport({ scale: 1 }), scale = (width / v.width) * ratio, vp = page.getViewport({ scale: scale });
            var c = el('canvas'); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height); c.setAttribute('aria-label', 'Page ' + n + ' of ' + doc.numPages);
            pages.appendChild(c);
            return page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
          }).then(next, next);
        })();
      });
    }).catch(function () { message(slide, 'This file didn\'t open. Try downloading it.', it); });
  }
  function download(it) {
    fetchBlob(it).then(function (b) { var a = el('a'); a.href = urlFor(b); a.download = it.name || 'attachment'; document.body.appendChild(a); a.click(); a.remove(); });
  }
  function show(i) {
    at = Math.max(0, Math.min(items.length - 1, i));
    var track = box.querySelector('.vw-track');
    track.scrollTo({ left: track.clientWidth * at, behavior: 'auto' });
    sync();
  }
  function sync() {
    box.querySelector('.vw-name').textContent = items[at].name || 'Attachment';
    box.querySelector('.vw-count').textContent = items.length > 1 ? (at + 1) + ' of ' + items.length : '';
    fill(at); if (at + 1 < items.length) fill(at + 1);
    box.querySelector('.vw-prev').hidden = at === 0; box.querySelector('.vw-next').hidden = at === items.length - 1;
  }
  function close() {
    if (!box) return;
    var gone = box; box = null;
    if (gone.open && gone.close) gone.close();
    gone.remove(); document.removeEventListener('keydown', keys);
    document.documentElement.style.overflow = '';
    urls.forEach(function (u) { URL.revokeObjectURL(u); }); urls = [];
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function keys(e) {
    if (!box) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') show(at + 1);
    else if (e.key === 'ArrowLeft') show(at - 1);
  }
  function button(text, label, fn, cls) { var b = el('button', 'vw-b' + (cls ? ' ' + cls : ''), text); b.type = 'button'; b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; }

  /** Open the viewer on a list of {url|blob, name}, starting at index. */
  function open(list, index) {
    if (!list || !list.length) return;
    style(); close();
    items = list.map(function (x) { return { url: x.url, blob: x.blob, name: x.name }; });
    lastFocus = document.activeElement;
    box = el('dialog', 'vw'); box.setAttribute('aria-label', 'Attachments');
    /* Escape closes it the viewer's way (tidying the files from memory). */
    box.addEventListener('cancel', function (e) { e.preventDefault(); close(); });
    var bar = el('div', 'vw-bar');
    bar.appendChild(el('span', 'vw-name')); bar.appendChild(el('span', 'vw-count'));
    bar.appendChild(button('Download', 'Download this file', function () { download(items[at]); }));
    var x = button('\u2715', 'Close', close); bar.appendChild(x);
    box.appendChild(bar);
    var track = el('div', 'vw-track');
    items.forEach(function () { track.appendChild(el('div', 'vw-slide')); });
    box.appendChild(track);
    box.appendChild(button('\u2039', 'Previous', function () { show(at - 1); }, 'vw-nav vw-prev'));
    box.appendChild(button('\u203a', 'Next', function () { show(at + 1); }, 'vw-nav vw-next'));
    var settle;
    track.addEventListener('scroll', function () { clearTimeout(settle); settle = setTimeout(function () { var i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth)); if (i !== at) { at = i; sync(); } }, 80); });
    document.body.appendChild(box);
    if (box.showModal) box.showModal(); else box.setAttribute('open', '');
    document.documentElement.style.overflow = 'hidden';
    document.addEventListener('keydown', keys);
    requestAnimationFrame(function () { show(index || 0); x.focus(); });
  }

  /* Any attachment link opens here: its neighbours in the same box are the gallery. */
  var SEL = 'a[href*="/api/admin/attachment?"], a[href*="/api/admin/photos?img="][href*="size=full"], a[data-view]';
  function nameOf(a) {
    if (a.dataset.name) return a.dataset.name;
    var img = a.querySelector('img'); var text = (a.textContent || '').trim() || (img && img.alt) || '';
    return text.replace(/^Report:\s*/, '') || 'Attachment';
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest(SEL);
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault();
    var scope = a.closest('dialog, [role="dialog"], section, li.card, .sheet, .pt-fold, ul, .sheet-thumbs') || document.body;
    var all = Array.prototype.slice.call(scope.querySelectorAll(SEL));
    var seen = {}, list = [];
    all.forEach(function (x) { if (!seen[x.href]) { seen[x.href] = 1; list.push({ url: x.href, name: nameOf(x), el: x }); } });
    open(list, Math.max(0, list.findIndex(function (x) { return x.url === a.href; })));
  });

  global.DSVIEW = { open: open, close: close };
})(window);
