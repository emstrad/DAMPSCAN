/* Company's tab row as a sliding switch (the owner's pick, 16 Nov 2026): the
   four tabs used most in one track with a lighter block that slides to the
   one you are on, the rest under More. Works on any .co-tabs row, whether its
   tabs are buttons (company.html) or links (company-hub.js); everything stays
   inside the row so company-tabs.js still finds every [data-tab]. */
(function (global) {
  'use strict';
  var KEEP = 4;
  var CHEV = '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var isOn = function (x) { return x.getAttribute('aria-pressed') === 'true' || x.getAttribute('aria-current') === 'page'; };

  function build(row) {
    if (row.dataset.seg) return;
    row.dataset.seg = '1';
    row.classList.remove('pills'); row.classList.add('seg-tabs'); row.removeAttribute('style');
    var items = [].slice.call(row.children);
    items.forEach(function (x) { x.classList.remove('pill'); x.removeAttribute('style'); x.classList.add('seg-tab'); });
    var thumb = document.createElement('i'); thumb.className = 'seg-thumb'; thumb.setAttribute('aria-hidden', 'true');
    row.insertBefore(thumb, row.firstChild);
    var rest = items.slice(KEEP), more = null, menu = null;
    var open = function (on) { menu.hidden = !on; more.setAttribute('aria-expanded', String(on)); };
    if (rest.length) {
      more = document.createElement('button'); more.type = 'button'; more.className = 'seg-tab seg-more';
      more.setAttribute('aria-haspopup', 'true'); more.setAttribute('aria-expanded', 'false');
      menu = document.createElement('div'); menu.className = 'seg-menu'; menu.hidden = true;
      rest.forEach(function (x) { x.classList.remove('seg-tab'); x.classList.add('seg-item'); menu.appendChild(x); });
      row.appendChild(more); row.appendChild(menu);
      more.addEventListener('click', function (e) { e.stopPropagation(); open(menu.hidden); });
      menu.addEventListener('click', function (e) { if (e.target.closest('.seg-item')) open(false); });
      document.addEventListener('click', function (e) { if (!menu.hidden && !menu.contains(e.target)) open(false); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) { open(false); more.focus(); } });
    }
    /* The block sits under the tab you are on; a tab under More lends More its name. */
    function place() {
      var cur = items.slice(0, KEEP).filter(isOn)[0];
      if (more) {
        var hid = rest.filter(isOn)[0];
        more.innerHTML = ''; more.appendChild(document.createTextNode(hid ? hid.textContent : 'More')); more.insertAdjacentHTML('beforeend', CHEV);
        if (more.getAttribute('aria-pressed') !== String(Boolean(hid))) more.setAttribute('aria-pressed', String(Boolean(hid)));
        if (hid) cur = more;
      }
      thumb.style.opacity = cur ? '1' : '0';
      if (cur) { thumb.style.left = cur.offsetLeft + 'px'; thumb.style.width = cur.offsetWidth + 'px'; }
    }
    new MutationObserver(place).observe(row, { subtree: true, attributes: true, attributeFilter: ['aria-pressed', 'aria-current'] });
    global.addEventListener('resize', place);
    place();
    /* Slide only once it has found its place, so the page never opens with a sweep. */
    global.requestAnimationFrame(function () { global.requestAnimationFrame(function () { row.classList.add('is-ready'); }); });
  }

  document.querySelectorAll('.co-tabs').forEach(build);
  global.DSSEGTABS = { build: build };
})(window);
