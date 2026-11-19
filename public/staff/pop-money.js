/* Their page and money in the job pop-up for ATi and DampScan (managers; the
   server refuses anyone else, and then nothing shows): their page's link to
   copy or text and how often it was opened, anything owed back after a
   cancellation or an overpayment, and a refund to the card they paid with
   through Stripe, after a confirm. Shown only when there is something. */
(function (global) {
  'use strict';
  var U = global.DSUI;
  var DAMP = ['dampscan', 'ati-london'];
  var pounds = function (p) { return '£' + (p / 100).toFixed(p % 100 ? 2 : 0); };

  async function render(box, j, changed) {
    if (DAMP.indexOf(j.site) === -1) return;
    var m;
    try { m = (await U.get('/api/admin/surveys?view=money&id=' + j.id)).money; } catch (e) { return; }
    if (!m) return;
    if (m.page && m.page.link) box.appendChild(pageRow(j, m.page));
    if (m.remind) box.appendChild(remindRow(j, m.remind));
    if (m.chase) box.appendChild(remindRow(j, m.chase, true));
    if (!m.owedBackPence && !m.cardPence) return;
    var d = document.createElement('details'); d.className = 'sheet-fold';
    d.appendChild(U.node('summary', null, m.owedBackPence ? 'Owed back ' + pounds(m.owedBackPence) : 'Refund'));
    if (m.refundedPence) d.appendChild(U.node('p', 'panel-note', 'Refunded so far: ' + pounds(m.refundedPence)));
    if (m.cardPence) {
      var f = document.createElement('form'); f.className = 'pop-date';
      var amt = document.createElement('input');
      amt.type = 'number'; amt.min = '0.01'; amt.step = '0.01'; amt.inputMode = 'decimal';
      amt.max = String(m.cardPence / 100);
      amt.value = String(Math.min(m.owedBackPence || m.cardPence, m.cardPence) / 100);
      amt.setAttribute('aria-label', 'Refund in pounds');
      var go = U.node('button', 'btn btn--ghost btn--sm', 'Refund to card'); go.type = 'submit';
      var note = U.node('p', 'panel-note', 'Up to ' + pounds(m.cardPence) + ' was paid by card.');
      f.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        var pence = Math.round(Number(amt.value) * 100);
        if (!(pence > 0)) { note.textContent = 'Enter the amount.'; return; }
        if (!global.confirm('Refund ' + pounds(pence) + ' to ' + (j.firstName || j.customerName || 'their') + '\'s card through Stripe? This cannot be undone.')) return;
        go.disabled = true; note.textContent = 'Refunding…';
        var r;
        try { r = await U.send('/api/admin/surveys', { op: 'refund', id: j.id, pence: pence }); } catch (e) { r = { ok: false, data: null }; }
        go.disabled = false;
        if (!r.ok) { note.textContent = (r.data && r.data.error) || 'Not refunded. Try again.'; return; }
        note.textContent = 'Refunded ' + pounds(r.data.refunded) + '.';
        if (changed) changed();
      });
      f.appendChild(amt); f.appendChild(go);
      d.appendChild(f); d.appendChild(note);
    } else if (!(m.payments || []).some(function (p) { return p.online; })) {
      /* Only for a survey paid by bank transfer alone: anything paid by card goes back through Stripe above. */
      d.appendChild(U.node('p', 'panel-note', 'Paid by bank transfer: send it back from Tide, then add the refund on the job.'));
    }
    box.appendChild(d);
  }

  /* Their page: Copy link, Text link (words with a tap-to-send link, never sent from here) and how often it was opened. */
  function pageRow(j, pg) {
    var row = U.node('div', 'pop-page');
    var chips = U.node('div', 'sheet-grid');
    var copy = U.node('button', 'sheet-big', 'Copy their page link'); copy.type = 'button';
    copy.addEventListener('click', function () {
      (navigator.clipboard ? navigator.clipboard.writeText(pg.link) : Promise.reject()).then(function () { copy.textContent = 'Copied'; }, function () { global.prompt('Their page link', pg.link); });
    });
    chips.appendChild(copy);
    var tel = j.phone ? String(j.phone).replace(/[^\d+]/g, '') : '';
    if (tel) {
      var words = 'Hi ' + (j.firstName || String(j.customerName || '').split(' ')[0] || 'there') + ', here is your survey page, to pay and see everything about your survey: ' + pg.link;
      var txt = U.node('a', 'sheet-big', 'Text them the link'); txt.href = 'sms:' + tel + '?&body=' + encodeURIComponent(words);
      chips.appendChild(txt);
    }
    row.appendChild(chips);
    row.appendChild(U.node('p', 'meta', pg.opened ? 'Their page: opened ' + pg.opened.times + ' time' + (pg.opened.times === 1 ? '' : 's') + ', last ' + new Date(pg.opened.last).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Their page: not opened yet'));
    return row;
  }

  var when = function (at) { return new Date(at).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
  var quiet = function () { var h = Number(new Date().toLocaleString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false })); return h >= 21 || h < 9; };

  /* The deposit reminder, or the balance chased, by hand: through the texts outbox, two minutes to undo (overnight it waits for 9am).
     A balance on a survey still on the old money (out of texts since the fresh start) goes with the Revolut details and their reference, not their page. */
  function remindRow(j, r, balance) {
    var row = U.node('div', 'pop-page');
    var first = j.firstName || String(j.customerName || '').split(' ')[0] || 'them';
    var go = U.node('button', 'btn btn--sm', balance ? 'Chase the ' + pounds(r.balancePence) + ' balance' : 'Send deposit reminder'); go.type = 'button';
    var undo = U.node('button', 'btn btn--ghost btn--sm', 'Undo'); undo.type = 'button'; undo.hidden = true;
    var note = U.node('p', 'meta', r.last ? (r.last.status === 'waiting' ? 'Reminder waiting, goes ' : 'Reminder sent ') + when(r.last.at) : balance ? (r.old ? 'Texts them the Revolut details and their name as the reference (old money)' : 'Texts them the balance and their page link') : 'Texts them the deposit and their page link');
    if (balance && r.bankMissing) { note.textContent = 'Add the Revolut details in Settings, Bank details, first'; go.disabled = true; }
    var id = null;
    go.addEventListener('click', async function () {
      go.disabled = true; note.textContent = 'Sending…';
      var x;
      try { x = await U.send('/api/admin/texts', { op: 'remind', what: balance ? 'balance' : 'deposit', jobId: j.id }); } catch (e) { x = { ok: false, data: null }; }
      if (!x.ok) { go.disabled = false; note.textContent = (x.data && x.data.error) || 'Not sent. Try again.'; return; }
      id = x.data.textId; go.hidden = true; undo.hidden = false;
      note.textContent = quiet() ? 'Texts ' + first + ' at 9am: Undo stops it' : 'Texts ' + first + ' in 2 min: Undo stops it';
    });
    undo.addEventListener('click', async function () {
      undo.disabled = true;
      var x;
      try { x = await U.send('/api/admin/texts', { op: 'cancel', id: id }); } catch (e) { x = { ok: false }; }
      undo.disabled = false;
      if (!x.ok) { note.textContent = 'Too late: it has gone.'; undo.hidden = true; return; }
      undo.hidden = true; note.textContent = 'Stopped. Nothing sent.';
    });
    var chips = U.node('div', 'sheet-grid'); chips.appendChild(go); chips.appendChild(undo);
    row.appendChild(chips); row.appendChild(note);
    return row;
  }

  global.DSPOPMONEY = { render: render };
})(window);
