/* Reply by text, in the job pop-up (the owner's ask, 16 Nov 2026): one place
   to answer an ATi or DampScan customer, mostly a message from their page.
   It goes from the brand's name through the texts outbox (lib/text-reply.js):
   two minutes to undo, never at night, signed with the sender's first name,
   ending with their page so they can write back, and once gone it sits on
   their history and on their page. Managers only (the server checks).
   Drawn like a chat (the owner's calmer screens): their words as a bubble, a
   dark box that grows as you type with the send button inside it, lit once
   there is something to send, then a countdown with Undo. */
(function (global) {
  'use strict';
  var U = global.DSUI;
  var when = function (at) { return new Date(at).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
  var quiet = function () { var h = Number(new Date().toLocaleString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false })); return h >= 21 || h < 9; };
  var BRAND = { 'ati-london': 'ATi Damp Survey', dampscan: 'DampScan' };
  var SEND = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';

  function render(j, section, changed) {
    var m = j.pageMessage;
    var s = section(m ? 'Reply to their message' : 'Reply by text', m ? 'open' : 'closed');
    var first = String(j.customerName || '').split(' ')[0] || 'them';
    var chat = U.node('div', 'rp');
    if (m) {
      var said = U.node('div', 'rp-them');
      said.appendChild(U.node('p', 'rp-bubble', m.text));
      if (m.at) said.appendChild(U.node('small', 'rp-meta', 'On their page · ' + when(m.at) + (m.count > 1 ? ' · ' + m.count + ' messages' : '')));
      /* A thank-you needs no answer (the owner, 16 Nov 2026): one tap notes it was read, which takes it
         off Needs you now, with no follow-up date set. */
      var done = U.node('button', 'c-link rp-done', 'No reply needed'); done.type = 'button';
      done.addEventListener('click', async function () {
        done.disabled = true;
        var x; try { x = await U.send('/api/admin/scheduling', { op: 'log', kind: 'job', id: j.id, how: 'note', note: 'Read their message: no reply needed', next: 'none' }); } catch (e) { x = { ok: false }; }
        if (!x.ok) { done.disabled = false; done.textContent = 'Could not save. Try again'; return; }
        if (changed) changed();
      });
      said.appendChild(done);
      chat.appendChild(said);
    }
    var box = U.node('form', 'rp-box');
    var ta = document.createElement('textarea');
    ta.rows = 1; ta.maxLength = 1000; ta.setAttribute('aria-label', 'Your reply to ' + first); ta.placeholder = 'Reply to ' + first + '…';
    var go = U.node('button', 'rp-send'); go.type = 'submit'; go.innerHTML = SEND; go.setAttribute('aria-label', 'Send text'); go.disabled = true;
    box.appendChild(ta); box.appendChild(go);
    chat.appendChild(box);
    var note = U.node('p', 'rp-note', 'Sends from ' + (BRAND[j.site] || 'the brand') + ' with their page link to write back');
    chat.appendChild(note);
    s.appendChild(chat);

    /* Grows with what is typed, up to six lines; send lights up once there is a word. */
    var fit = function () { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'; go.disabled = ta.value.trim().length < 2; };
    ta.addEventListener('input', fit);
    ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); box.requestSubmit(); } });

    var id = null, timer = null;
    function sending(label) {
      note.textContent = ''; note.className = 'rp-note rp-status';
      note.appendChild(U.node('span', 'rp-dot'));
      var t = U.node('span', null, label); note.appendChild(t);
      var undo = U.node('button', 'c-link rp-undo', 'Undo'); undo.type = 'button';
      undo.addEventListener('click', async function () {
        undo.disabled = true;
        var x; try { x = await U.send('/api/admin/texts', { op: 'cancel', id: id }); } catch (e) { x = { ok: false }; }
        clearInterval(timer);
        if (!x.ok) { note.textContent = 'Already sent.'; if (changed) changed(); return; }
        note.className = 'rp-note'; note.textContent = 'Stopped. Nothing sent.';
        ta.readOnly = false; box.classList.remove('is-sent'); fit(); ta.focus();
      });
      note.appendChild(undo);
      return t;
    }
    box.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      if (ta.value.trim().length < 2) { ta.focus(); return; }
      go.disabled = true; box.classList.add('is-busy');
      var x;
      try { x = await U.send('/api/admin/texts', { op: 'reply', jobId: j.id, words: ta.value }); } catch (e) { x = { ok: false, data: null }; }
      box.classList.remove('is-busy');
      if (!x.ok) { go.disabled = false; note.className = 'rp-note is-bad'; note.textContent = (x.data && x.data.error) || 'Not sent. Try again.'; return; }
      id = x.data.textId; ta.readOnly = true; box.classList.add('is-sent');
      if (quiet()) { sending('Texts ' + first + ' at 9am'); return; }
      var left = 120, t = sending('Sending in 2:00');
      timer = setInterval(function () { left -= 1; if (left <= 0) { clearInterval(timer); t.textContent = 'Sent to ' + first; return; } t.textContent = 'Sending in ' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0'); }, 1000);
    });
  }

  global.DSPOPREPLY = { render: render };
})(window);
