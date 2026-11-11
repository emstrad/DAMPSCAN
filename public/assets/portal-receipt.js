/* Receipts on the customer's page (lib/portal.js receiptsFor): every payment
   with its own receipt, issued in the customer's name for the property, from
   the company (its details come from the server, so this shared file names
   neither brand). Opens on screen, with Print or save as PDF. */
(function (global) {
  'use strict';
  var P = global.PT, h = P.h, t = P.t, btn = P.btn, money = P.money;
  var longDay = function (d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }); };

  function open(p, r) {
    var c = p.receipts.company, to = p.receipts.to;
    var shade = h('div', 'pt-receipt-shade'), sheet = h('div', 'pt-receipt');
    sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-label', 'Receipt ' + r.number);
    sheet.appendChild(t('h2', null, 'Receipt'));
    sheet.appendChild(t('p', 'pt-receipt-no', r.number + ' · ' + longDay(r.day)));
    var from = h('div', 'pt-receipt-from'); from.appendChild(t('b', null, c.name));
    if (p.brand && p.brand.name) from.appendChild(t('span', null, 'Trading as ' + p.brand.name));
    if (c.office) from.appendChild(t('span', null, c.office));
    if (c.number) from.appendChild(t('span', null, 'Company number ' + c.number));
    if (c.vatNumber) from.appendChild(t('span', null, 'VAT number ' + c.vatNumber));
    sheet.appendChild(from);
    var whom = h('div', 'pt-receipt-to'); whom.appendChild(t('small', null, 'Received in the name of'));
    whom.appendChild(t('b', null, to.name || 'Customer')); if (to.address) whom.appendChild(t('span', null, to.address)); sheet.appendChild(whom);
    var line = h('div', 'pt-lines');
    var a = h('div'); a.appendChild(t('span', null, p.survey + ', ref ' + p.reference)); a.appendChild(t('b', null, money(r.pence))); line.appendChild(a);
    var tot = h('div', 'tot'); tot.appendChild(t('span', null, 'Paid (' + r.how.toLowerCase() + ')')); tot.appendChild(t('b', null, money(r.pence))); line.appendChild(tot);
    sheet.appendChild(line);
    sheet.appendChild(t('p', 'pt-hint', 'Total for the survey ' + money(p.money.pricePence) + ', paid so far ' + money(p.money.paidPence) + (p.money.balancePence ? ', left to pay ' + money(p.money.balancePence) : ', paid in full') + '.'));
    var row = h('div', 'pt-chips');
    row.appendChild(btn('pt-chip', '<span>Print or save as PDF</span>', function () { global.print(); }));
    var close = btn('pt-chip', '<span>Close</span>', function () { shade.remove(); document.documentElement.classList.remove('pt-printing'); });
    row.appendChild(close); sheet.appendChild(row);
    shade.appendChild(sheet);
    shade.addEventListener('click', function (e) { if (e.target === shade) close.click(); });
    document.body.appendChild(shade);
    document.documentElement.classList.add('pt-printing');
    close.focus();
  }

  function list(p, box) {
    if (!p.receipts || !p.receipts.items.length) return;
    var wrap = h('div', 'pt-receipts');
    p.receipts.items.forEach(function (r) {
      var row = h('div', 'pt-receipt-row');
      row.appendChild(t('span', null, longDay(r.day) + ' · ' + (r.refund ? 'Refund ' + money(-r.pence) : money(r.pence))));
      if (!r.refund) row.appendChild(btn('pt-chip', '<span>Receipt</span>', function () { open(p, r); }));
      wrap.appendChild(row);
    });
    box.appendChild(wrap);
  }

  global.PTRECEIPT = { list: list };
})(window);
