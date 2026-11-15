/* Company's tabs, remembered in the address (#pay, #money, #bank). Each tab's
   script registers a loader on DSCOTABS, run whenever its tab opens, so a tab
   costs nothing until it is looked at. Loaded after every tab's script. */
(function (global) {
  'use strict';
  var loaders = global.DSCOTABS = global.DSCOTABS || {};
  var buttons = document.querySelectorAll('.co-tabs [data-tab]');
  var FIRST = 'overview';
  function show(tab) {
    buttons.forEach(function (b) {
      var on = b.dataset.tab === tab, panel = document.getElementById('tab-' + b.dataset.tab);
      b.setAttribute('aria-pressed', String(on)); if (panel) panel.hidden = !on;
    });
    if (global.history && global.history.replaceState) global.history.replaceState(null, '', global.location.pathname + global.location.search + (tab === FIRST ? '' : '#' + tab));
    if (loaders[tab]) loaders[tab]();
  }
  buttons.forEach(function (b) { b.addEventListener('click', function () { show(b.dataset.tab); }); });
  global.DSCOSHOW = show;
  var start = global.location.hash.slice(1);
  show(document.querySelector('.co-tabs [data-tab="' + start + '"]') ? start : FIRST);
})(window);
