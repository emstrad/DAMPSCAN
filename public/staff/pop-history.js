/* "Everything so far" inside the job pop-up, so a customer reads the same
   wherever they are tapped (Today, Scheduling, Surveys, Reports, Clients):
   calls, emails, texts, notes, money and progress newest first, with a box
   to add to it. Damp jobs only, managers only (the server refuses the work
   login, and then the section is left out). Entries are drawn by
   sched-card.js so the colours match the Scheduling card. */
(function (global) {
  'use strict';
  var U = global.DSUI;
  var DAMP = ['dampscan', 'ati-london'];

  async function fill(j, list) {
    list.textContent = '';
    try {
      var r = await U.get('/api/admin/scheduling?card=job:' + j.id);
      if (!r.entries.length) list.appendChild(U.node('li', 'panel-note', 'Nothing logged yet.'));
      r.entries.forEach(function (e) { list.appendChild(global.DSSCHEDCARD.entry(e)); });
      return true;
    } catch (e) { return false; }
  }

  function render(j, section) {
    if (DAMP.indexOf(j.site) === -1 || !global.DSSCHEDCARD) return;
    var box = section('History', 'closed');
    box.hidden = true;
    var row = U.node('div', 'sched-row scc');
    var how = document.createElement('select'); how.setAttribute('aria-label', 'What happened');
    [['call', 'Called'], ['email', 'Emailed'], ['text', 'Texted'], ['note', 'Note']].forEach(function (h) { var o = document.createElement('option'); o.value = h[0]; o.textContent = h[1]; how.appendChild(o); });
    var said = document.createElement('input'); said.placeholder = 'What was said'; said.setAttribute('aria-label', 'What was said');
    var go = U.node('button', 'btn btn--sm', 'Log'); go.type = 'button';
    row.appendChild(how); row.appendChild(said); row.appendChild(go);
    var list = U.node('ol', 'scc-list');
    box.appendChild(row); box.appendChild(list);
    go.addEventListener('click', async function () {
      go.disabled = true;
      await U.send('/api/admin/scheduling', { op: 'log', kind: 'job', id: j.id, how: how.value, note: said.value });
      said.value = ''; go.disabled = false;
      fill(j, list);
    });
    fill(j, list).then(function (ok) { box.hidden = !ok; });
  }

  global.DSPOPHIST = { render: render };
})(window);
