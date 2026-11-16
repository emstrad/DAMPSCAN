/* "Everything so far" inside the job pop-up, so a customer reads the same
   wherever they are tapped (Today, Scheduling, Surveys, Reports, Clients):
   calls, emails, texts, notes, money and progress newest first, with a box
   to add to it, and the job's note for the surveyor pinned at the top
   (no separate Notes box). Damp jobs only, managers only (the server refuses the work
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

  /* The one history (the owners' plan): the job's note for the surveyor sits
     pinned at its top with its own Save, and the separate Notes box goes.
     Surveyors, who have no history, keep the Notes box. */
  function pin(box, noteSec) {
    var form = noteSec && noteSec.querySelector('form');
    if (!form) return;
    /* Folded to one line saying what it holds, so an empty box never fills the screen. */
    var p = document.createElement('details'); p.className = 'pop-pin';
    var ta = form.querySelector('textarea'), words = ta && ta.value.trim();
    var s = U.node('summary'), l = U.node('span', 'c-l');
    l.appendChild(U.node('b', null, 'Note for the surveyor'));
    l.appendChild(U.node('small', null, words ? words.split('\n')[0].slice(0, 60) : 'None yet'));
    s.appendChild(l); p.appendChild(s); p.appendChild(form);
    box.insertBefore(p, box.children[1] || null);
    noteSec.remove();
    var sum = box.querySelector('summary'); if (sum) sum.textContent = 'History and notes';
  }

  function render(j, section, noteSec) {
    if (DAMP.indexOf(j.site) === -1 || !global.DSSCHEDCARD) return;
    var box = section('History', 'closed');
    box.hidden = true;
    /* One composer, the same shape as the reply and to-do boxes: what happened, the words, send. */
    var row = U.node('form', 'hist-log scc');
    var how = document.createElement('select'); how.setAttribute('aria-label', 'What happened');
    [['call', 'Called'], ['email', 'Emailed'], ['text', 'Texted'], ['note', 'Note']].forEach(function (h) { var o = document.createElement('option'); o.value = h[0]; o.textContent = h[1]; how.appendChild(o); });
    var said = document.createElement('input'); said.placeholder = 'What was said'; said.setAttribute('aria-label', 'What was said');
    var go = U.node('button', 'td-plus hist-go'); go.type = 'submit'; go.setAttribute('aria-label', 'Log it');
    go.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
    row.appendChild(how); row.appendChild(said); row.appendChild(go);
    var list = U.node('ol', 'scc-list');
    box.appendChild(row); box.appendChild(list);
    row.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      go.disabled = true;
      await U.send('/api/admin/scheduling', { op: 'log', kind: 'job', id: j.id, how: how.value, note: said.value });
      said.value = ''; go.disabled = false;
      fill(j, list);
    });
    fill(j, list).then(function (ok) { box.hidden = !ok; if (ok) pin(box, noteSec); });
  }

  global.DSPOPHIST = { render: render };
  /* The money part of the same pop-up (refunds), loaded wherever the history is. */
  if (!global.DSPOPMONEY) { var sc = document.createElement('script'); sc.src = '/staff/pop-money.js'; document.head.appendChild(sc); }
})(window);
