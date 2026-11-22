/* Holds the staff pages to the real screen, above all as a home screen app
   on iPhone. There iOS can keep the keyboard's smaller height after the
   keyboard has gone (dvh, innerHeight and the visual viewport all stale), so a
   pop-up stopped mid-screen and the bottom bar sat hidden or adrift (the
   owner, 22 Nov 2026). So the height is measured here into --app-h, which the
   pop-ups use instead of dvh, the bar only steps aside while a field is really
   being typed in, and iOS is nudged to settle once the keyboard goes. On a phone
   the page is an app screen (shell.css, app-shell): the body scrolls, the bar is
   a plain row beneath it outside the body, nothing is fixed to the screen's foot. */
(function (global) {
  'use strict';
  var doc = document.documentElement;
  var vv = global.visualViewport;
  var app = global.navigator.standalone === true ||
    Boolean(global.matchMedia && global.matchMedia('(display-mode: standalone)').matches);
  if (app) doc.classList.add('is-app');
  /* The tallest the screen has been in each orientation: a home screen app has
     no toolbars, so only the keyboard ever makes it shorter. */
  var tallest = {};
  var side = function () { return global.innerWidth > global.innerHeight ? 'wide' : 'tall'; };

  function typing() {
    var a = document.activeElement;
    return Boolean(a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable) &&
      !/^(checkbox|radio|button|submit|range|file|reset|color)$/.test(a.type || ''));
  }

  /* A phone's width: the bar becomes a row after the body, so the body alone scrolls. */
  var phone = global.matchMedia ? global.matchMedia('(max-width:759px)') : null;
  function shell() {
    var bar = document.querySelector('.bottom-bar');
    var on = Boolean(phone && phone.matches && bar);
    doc.classList.toggle('app-shell', on);
    if (bar && on && bar.parentNode !== doc) doc.appendChild(bar);
    else if (bar && !on && bar.parentNode === doc) document.body.appendChild(bar);
  }

  function fit() {
    var seen = vv ? vv.height : global.innerHeight;
    var inner = Math.max(global.innerHeight, doc.clientHeight || 0);
    var typingNow = typing();
    var key = side();
    if (!typingNow) tallest[key] = Math.max(tallest[key] || 0, inner, seen);
    var full = app ? (tallest[key] || inner) : inner;
    /* A keyboard is only ever open while a field has focus: a stale short
       height with nothing focused must never hide the bar. */
    var kb = typingNow && seen < full - 120;
    doc.classList.toggle('kb-open', kb);
    var h = kb || !app ? seen : full;
    doc.style.setProperty('--app-h', Math.round(h) + 'px');
    var bar = document.querySelector('.bottom-bar');
    if (!bar) return;
    /* In a browser tab Safari's toolbars move the visible bottom; hold the bar
       to it. The home screen app pins it to the measured height instead (CSS). */
    var gap = vv && !kb && !app && !doc.classList.contains('app-shell') ? Math.round(vv.height + vv.offsetTop - global.innerHeight) : 0;
    bar.style.transform = gap && Math.abs(gap) < 120 ? 'translate3d(0,' + gap + 'px,0)' : '';
  }

  /* iOS leaves the page shifted up after the keyboard: a scroll to where it
     already is makes it lay the screen out again. */
  function settle() {
    if (typing()) return;
    /* As an app screen the page itself never scrolls, so any offset left is iOS's and goes. */
    if (doc.classList.contains('app-shell') && (global.scrollY || global.scrollX)) global.scrollTo(0, 0);
    else if (app) global.scrollTo(global.scrollX, Math.max(0, global.scrollY));
    fit();
  }
  function later() { setTimeout(settle, 60); setTimeout(settle, 400); setTimeout(settle, 900); }

  if (vv) { vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); }
  global.addEventListener('scroll', fit, { passive: true });
  global.addEventListener('resize', fit);
  global.addEventListener('orientationchange', function () { tallest = {}; later(); });
  global.addEventListener('pageshow', later);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) later(); });
  document.addEventListener('focusin', fit);
  document.addEventListener('focusout', later);
  /* A pop-up opening or closing is when a stale height shows: look again then. */
  new MutationObserver(function () { fit(); }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
  if (phone) { if (phone.addEventListener) phone.addEventListener('change', function () { shell(); fit(); }); else if (phone.addListener) phone.addListener(function () { shell(); fit(); }); }
  global.addEventListener('scroll', function () { if (doc.classList.contains('app-shell') && !typing() && global.scrollY) global.scrollTo(0, 0); }, { passive: true });
  shell();
  fit();
  global.DSFIT = { fit: fit, settle: settle };
})(window);
