/* Scheduling as three views, one at a time on a phone (the owner's preview,
   16 Nov 2026): To book, Day plan and After the visit, with the counts on the
   switch; on a wide screen all three show, so a card can still be dragged
   onto a free time. Who's free opens as its own sheet from the button at the
   top. The view picked is remembered for the tab. */
(function (global) {
  'use strict';
  var btns = document.querySelectorAll('.sch-views [data-view]');
  var panes = document.querySelectorAll('.sch-pane');
  function show(v) {
    btns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.view === v)); });
    panes.forEach(function (p) { p.classList.toggle('is-off', p.dataset.pane !== v); });
    try { sessionStorage.setItem('sch-view', v); } catch (e) { /* private mode: not remembered */ }
  }
  btns.forEach(function (b) { b.addEventListener('click', function () { show(b.dataset.view); }); });
  var start = 'book';
  try { start = sessionStorage.getItem('sch-view') || 'book'; } catch (e) { /* default */ }
  /* A link to one customer's card always lands on the board that holds it. */
  show(/^#(lead|job)-/.test(location.hash) ? 'book' : start);

  /* The counts on the switch follow what is drawn. */
  function count(id, out) {
    var box = document.getElementById(id), n = document.getElementById(out);
    if (!box || !n) return;
    var tally = function () { var c = box.querySelectorAll('.sched-card:not(.sched-coldfold .sched-card), .dsp-item').length; n.textContent = c ? String(c) : ''; };
    new MutationObserver(tally).observe(box, { childList: true, subtree: true }); tally();
  }
  count('board', 'n-book'); count('after', 'n-after');

  var dlg = document.getElementById('free-dlg');
  document.getElementById('free-open').addEventListener('click', function () { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); });
  document.getElementById('free-close').addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });

  /* Today's Who's free? button lands here with the sheet open. */
  if (location.hash === '#free') { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); }

  global.DSSCHVIEW = { show: show };
})(window);
