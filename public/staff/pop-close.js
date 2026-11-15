/* Not going ahead, in the job pop-up (the owner, UAT 15 Nov 2026: a test card
   in "Not booked in yet" had no way off the board). Managers only, a damp
   survey not done yet; the reason is asked first so it is never tapped by
   mistake. The job is cancelled, never deleted, through the Scheduling route
   (lib/routes/admin/scheduling.js op close), and can be brought back. */
(function (global) {
  'use strict';
  var U = global.DSUI;
  function render(j, section, changed) {
    var s = section('Not going ahead', 'closed');
    var row = U.node('div', 'sheet-row');
    var why = document.createElement('select'); why.setAttribute('aria-label', 'Why it is not going ahead');
    ['Booked elsewhere', 'Not interested', 'No answer', 'Already sorted', 'Test or mistake', 'Other'].forEach(function (w) { var o = document.createElement('option'); o.value = w; o.textContent = w; why.appendChild(o); });
    var go = U.node('button', 'pill', 'Close'); go.type = 'button';
    var note = U.node('p', 'meta');
    go.addEventListener('click', async function () {
      if (!global.confirm('Close ' + (j.customerName || 'this survey') + ': ' + why.value + '? It is kept as cancelled and can be brought back.')) return;
      var r = await U.send('/api/admin/scheduling', { op: 'close', kind: 'job', id: j.id, reason: why.value });
      if (!r.ok) { note.textContent = (r.data && r.data.error) || 'Could not close it.'; return; }
      changed();
    });
    row.appendChild(why); row.appendChild(go);
    s.appendChild(row); s.appendChild(note);
  }
  global.DSPOPCLOSE = { render: render };
})(window);
