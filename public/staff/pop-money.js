/* Their page and money in the job pop-up for ATi and DampScan (managers; the
   server refuses anyone else, and then nothing shows): their page's link to
   copy or text and how often it was opened, anything owed back after a
   cancellation or an overpayment, and a refund to the card they paid with
   through Revolut, after a confirm. Shown only when there is something. */
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
      var go = U.node('button', 'btn btn--primary btn--sm', 'Refund to card'); go.type = 'submit';
      var note = U.node('p', 'panel-note', 'Up to ' + pounds(m.cardPence) + ' was paid by card.');
      f.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        var pence = Math.round(Number(amt.value) * 100);
        if (!(pence > 0)) { note.textContent = 'Enter the amount.'; return; }
        if (!global.confirm('Refund ' + pounds(pence) + ' to ' + (j.firstName || j.customerName || 'their') + '\'s card through Revolut? This cannot be undone.')) return;
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
    } else d.appendChild(U.node('p', 'panel-note', 'Paid by bank: send it back from the bank app, then add the refund on the job.'));
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

  global.DSPOPMONEY = { render: render };
})(window);
