/* Reply by text, in the job pop-up (the owner's ask, 16 Nov 2026): one place
   to answer an ATi or DampScan customer, mostly a message from their page.
   It goes from the brand's name through the texts outbox (lib/text-reply.js):
   two minutes to undo, never at night, signed with the sender's first name,
   ending with their page so they can write back, and once gone it sits on
   their history and on their page. Managers only (the server checks). */
(function (global) {
  'use strict';
  var U = global.DSUI;
  var when = function (at) { return new Date(at).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
  var quiet = function () { var h = Number(new Date().toLocaleString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false })); return h >= 21 || h < 9; };

  function render(j, section, changed) {
    var m = j.pageMessage;
    var s = section(m ? 'Reply to their message' : 'Reply by text', m ? 'open' : 'closed');
    var first = String(j.customerName || '').split(' ')[0] || 'them';
    if (m) {
      var said = U.node('div', 'sheet-ask');
      said.appendChild(U.node('p', 'sheet-note', '"' + m.text + (m.text.length >= 120 ? '…' : '') + '"'));
      if (m.at) said.appendChild(U.node('p', 'meta', 'On their page, ' + when(m.at) + (m.count > 1 ? ' (' + m.count + ' messages)' : '')));
      s.appendChild(said);
    }
    var f = U.node('form', 'sheet-notes');
    var ta = document.createElement('textarea');
    ta.rows = 3; ta.maxLength = 600; ta.setAttribute('aria-label', 'Your reply to ' + first);
    ta.placeholder = 'Hi ' + first + ', ';
    var go = U.node('button', 'btn btn--primary btn--sm', 'Send text'); go.type = 'submit';
    var undo = U.node('button', 'btn btn--ghost btn--sm', 'Undo'); undo.type = 'button'; undo.hidden = true;
    var note = U.node('p', 'meta', 'Sent from the brand name with their page link to write back.');
    var id = null;
    f.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      if (ta.value.trim().length < 2) { ta.focus(); return; }
      go.disabled = true; note.textContent = 'Sending…';
      var x;
      try { x = await U.send('/api/admin/texts', { op: 'reply', jobId: j.id, words: ta.value }); } catch (e) { x = { ok: false, data: null }; }
      go.disabled = false;
      if (!x.ok) { note.textContent = (x.data && x.data.error) || 'Not sent. Try again.'; return; }
      id = x.data.textId; go.hidden = true; undo.hidden = false; ta.readOnly = true;
      note.textContent = (quiet() ? 'Texts ' + first + ' at 9am' : 'Texts ' + first + ' in 2 min') + ': Undo stops it.';
    });
    undo.addEventListener('click', async function () {
      undo.disabled = true;
      var x;
      try { x = await U.send('/api/admin/texts', { op: 'cancel', id: id }); } catch (e) { x = { ok: false }; }
      undo.disabled = false; undo.hidden = true;
      if (!x.ok) { note.textContent = 'Too late: it has gone.'; if (changed) changed(); return; }
      go.hidden = false; ta.readOnly = false; ta.focus();
      note.textContent = 'Stopped. Nothing sent.';
    });
    f.appendChild(ta); f.appendChild(go); f.appendChild(undo);
    s.appendChild(f); s.appendChild(note);
  }

  global.DSPOPREPLY = { render: render };
})(window);
