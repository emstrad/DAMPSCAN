/* Business details and VAT, on the Insights page, for whoever manages the
   business: whether it is VAT registered (and so whether quotes and invoices
   charge VAT), the details an invoice prints, and the last twelve months'
   work against the registration threshold, so registering is never a
   surprise. Asked for per business; anyone who does not manage it gets a 403
   and simply sees nothing. */
(function (global) {
  'use strict';

  var U = global.DSUI;
  var el = function (id) { return document.getElementById(id); };
  var sites = (global.DSAREA && global.DSAREA.sites) || [];

  function input(type, value, attrs) {
    var i = document.createElement(type === 'textarea' ? 'textarea' : 'input');
    if (type !== 'textarea') i.type = type;
    if (type === 'checkbox') i.checked = Boolean(value); else i.value = value || '';
    Object.assign(i, attrs || {});
    return i;
  }

  function row(labelText, control, id) {
    var r = U.node('div', 'form-row');
    var l = U.node('label', null, labelText);
    control.id = id;
    l.htmlFor = id;
    r.appendChild(l);
    r.appendChild(control);
    return r;
  }

  function meter(t) {
    var pct = Math.min(100, Math.round((t.last12Pence / t.thresholdPence) * 100));
    var box = U.node('div', 'vat-meter');
    var bar = U.node('div', 'vat-bar');
    var fill = U.node('span', pct >= 75 ? 'is-near' : '');
    fill.style.width = pct + '%';
    bar.appendChild(fill);
    box.appendChild(bar);
    box.appendChild(U.node('p', 'panel-note', U.money(t.last12Pence) + ' of work done in the last 12 months, against the ' + U.money(t.thresholdPence)
      + ' VAT registration threshold (' + pct + '%).' + (pct >= 75 ? ' Getting close: once it goes over, you must register within 30 days of the end of that month. Check gov.uk/vat-registration.' : '')));
    return box;
  }

  function form(d) {
    var b = d.business;
    var box = U.node('form', 'biz');
    box.noValidate = true;
    box.appendChild(U.node('h3', 'search-title', b.name));
    box.appendChild(meter(d.turnover));
    var vat = input('checkbox', b.vatRegistered);
    var tick = U.node('label', 'photo-tick');
    tick.appendChild(vat);
    tick.appendChild(document.createTextNode(' VAT registered: charge VAT on quotes and invoices'));
    box.appendChild(tick);
    var key = b.site;
    var number = input('text', b.vatNumber, { autocomplete: 'off', placeholder: 'GB123456789' });
    var address = input('textarea', b.tradingAddress, { rows: 3, placeholder: 'Trading address, as it should appear on invoices' });
    var company = input('text', b.companyNumber, { autocomplete: 'off', placeholder: 'Only if a limited company' });
    var pay = input('textarea', b.paymentDetails, { rows: 2, placeholder: 'e.g. Bank transfer to Verge Roofing Ltd, sort code 00-00-00, account 00000000' });
    var grid = U.node('div', 'jgrid');
    [row('VAT number', number, 'b-vat-' + key), row('Company number', company, 'b-co-' + key),
     row('Address', address, 'b-addr-' + key), row('How customers pay', pay, 'b-pay-' + key)].forEach(function (r) { grid.appendChild(r); });
    /* The damp brands only: the Revolut details a balance chase sends for a survey booked before go-live (lib/balance-chase.js). */
    var oldPay = null;
    if (key === 'dampscan' || key === 'ati-london') {
      oldPay = input('textarea', b.oldPaymentDetails, { rows: 2, placeholder: 'e.g. Damp Surveying Limited, sort code 00-00-00, account 00000000' });
      grid.appendChild(row('Revolut, for bookings before 15 Nov', oldPay, 'b-old-' + key));
    }
    box.appendChild(grid);
    var err = U.node('span', 'err');
    err.setAttribute('role', 'alert');
    var saved = U.node('span', 'who');
    saved.setAttribute('role', 'status');
    var btn = U.node('button', 'btn btn--ghost btn--sm', 'Save');
    btn.type = 'submit';
    var actions = U.node('div', 'top-end');
    actions.style.marginTop = '12px';
    actions.appendChild(btn);
    actions.appendChild(saved);
    box.appendChild(err);
    box.appendChild(actions);
    box.addEventListener('submit', async function (e) {
      e.preventDefault();
      err.classList.remove('is-shown');
      saved.textContent = '';
      if (vat.checked && !b.vatRegistered && !global.confirm('Switch VAT on for ' + b.name + '? From now on every open quote and new invoice adds VAT at 20%. Only do this from the date your registration takes effect.')) return;
      var res = await U.send('/api/admin/business', {
        site: key, vatRegistered: vat.checked, vatNumber: number.value, tradingAddress: address.value,
        companyNumber: company.value, paymentDetails: pay.value, oldPaymentDetails: oldPay ? oldPay.value : undefined
      });
      if (!res.ok) { var es = (res.data && res.data.errors) || {}; err.textContent = es[Object.keys(es)[0]] || 'That could not be saved.'; err.classList.add('is-shown'); return; }
      b = res.data.business;
      saved.textContent = 'Saved';
    });
    return box;
  }

  async function load() {
    var mount = el('business');
    var shown = 0;
    for (var i = 0; i < sites.length; i++) {
      try {
        var d = await U.get('/api/admin/business?site=' + sites[i]);
        if (d && d.ok) { mount.appendChild(form(d)); shown += 1; }
      } catch (e) { /* not a manager of this one */ }
    }
    el('p-business').hidden = !shown;
    /* Arrived from Settings' ready list: bring the payment details into view. */
    if (shown && location.hash === '#p-business') el('p-business').scrollIntoView({ block: 'start' });
  }

  load();
})(window);
