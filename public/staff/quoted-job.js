/* The working screen for one quoted job: filling the dialog from a job.
   Every input sits beside the figure it changes, so a person entering a cost
   sees the fee move. Nothing here sends anything; quoted-lines.js owns the
   forms and calls fill() again with what the server returns. */
(function (global) {
  'use strict';

  var U = global.DSUI;
  var Q = global.DSQ;
  var el = function (id) { return document.getElementById(id); };

  var STATUS_TONE = { paid: ' tag--good', quoted: ' tag--accent', declined: ' tag--muted', cancelled: ' tag--muted', refunded: ' tag--muted' };

  function tile(mount, label, value, keyed, sub) {
    var d = U.node('div', 'tile' + (keyed ? ' is-key' : ''));
    d.appendChild(U.node('span', 'k', label));
    d.appendChild(U.node('span', 'v', value));
    if (sub) d.appendChild(U.node('span', 's', sub));
    mount.appendChild(d);
  }

  function pct(bp) { return (bp / 100) + '%'; }

  /* ---------- the figure ---------- */
  function fillFigure(j) {
    var mount = el('w-tiles');
    var p = j.payout;
    mount.textContent = '';
    if (j.model === 'roofing') {
      tile(mount, 'Invoice net', U.money(p.invoiceNet));
      tile(mount, 'Costs', U.money(p.directTotal), false, j.costs.length + (j.costs.length === 1 ? ' line' : ' lines'));
      tile(mount, 'Balance', U.money(p.balance));
      tile(mount, 'Tax reserve ' + pct(j.rates.reserveBp), U.money(p.reserve));
      tile(mount, 'Fee base', U.money(p.feeBase));
      tile(mount, 'Scott\'s fee', U.money(p.scottFee), true,
        p.floorApplied ? pct(j.rates.feeBp) + ' would be ' + U.money(p.feePercent) + ', the floor is ' + U.money(p.feeFloorPence)
          : pct(j.rates.feeBp) + ' of the fee base');
      tile(mount, 'Owners\' wages', U.money(p.wages), false, p.ownerDays.length ? p.ownerDays.length + ' working' : 'nobody yet');
      tile(mount, p.lossMaking ? 'Loss' : 'Kept by the company', U.money(p.retained));
      el('w-basis').textContent = 'Invoice less costs, less ' + pct(j.rates.reserveBp) + ' set aside for Corporation Tax, is the fee base. '
        + 'Scott is paid ' + pct(j.rates.feeBp) + ' of it or ' + U.money(j.rates.feeFloorPence) + ', whichever is more, on every job including a loss. '
        + 'The owners are paid their days. The company keeps the rest.';
    } else {
      tile(mount, 'Invoice net', U.money(p.invoiceNet));
      tile(mount, 'Costs', U.money(p.costTotal), false, j.costs.length + (j.costs.length === 1 ? ' line' : ' lines'));
      tile(mount, p.lossMaking ? 'Loss' : 'Profit', U.money(p.profit));
      p.partners.forEach(function (name, i) {
        tile(mount, Q.rowName({ key: name }), U.money(p.pay[name]), true, i === 0 ? pct(j.rates.splitBp) : 'the rest');
      });
      el('w-basis').textContent = 'Invoice less every cost line is the profit, split ' + pct(j.rates.splitBp) + ' to '
        + Q.rowName({ key: p.partners[0] }) + ' and the rest to ' + Q.rowName({ key: p.partners[1] })
        + '. A loss pays nobody and is not hidden.';
    }

    var owed = el('w-owed');
    owed.textContent = '';
    var rows = j.frozen ? j.frozen.rows : j.payoutRows;
    if (!rows.length) owed.appendChild(U.node('p', 'empty', j.model === 'roofing' ? 'Nobody is owed anything yet: record who brought the job in and who worked it.' : 'Nothing to pay out yet.'));
    rows.forEach(function (r) {
      var line = U.node('div', 'work-owed-row');
      line.appendChild(U.node('span', 'k', Q.rowName(r) + (r.key === 'finder' ? ', finder\'s fee' : r.key.indexOf('owner:') === 0 ? ', days worked' : '')));
      line.appendChild(U.node('span', 'v', U.money(r.amountPence)));
      owed.appendChild(line);
    });

    var frozen = el('w-frozen');
    frozen.hidden = !j.frozen;
    if (j.frozen) {
      frozen.textContent = 'Frozen ' + U.when(j.frozen.at) + ' by ' + Q.personName(j.frozen.by) + '. The figures above are what was stored when the money cleared.'
        + (j.frozen.driftPence ? ' Since then a line has changed: worked out now it would be ' + U.money(j.frozen.driftPence).replace(/^−/, '') + (j.frozen.driftPence < 0 ? ' less' : ' more') + '. The stored figure stands unless an admin reopens it.' : '');
      frozen.classList.toggle('is-drift', Boolean(j.frozen.driftPence));
    }
  }

  /* ---------- the lines ---------- */
  function removeButton(label, onClick) {
    var b = U.node('button', 'pill', label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  function fillCosts(j) {
    U.table(el('w-costs'), [
      { label: 'Cost', wrap: true, get: function (c) {
        /* Who entered it and when, under the label rather than in a column of
           its own, so the row fits beside its Remove button on a phone. */
        var cell = U.node('span', null, c.label);
        cell.appendChild(U.node('small', null, Q.personName(c.addedBy) + ', ' + U.when(c.addedAt)));
        return cell;
      } },
      { label: '£', numeric: true, get: function (c) { return U.money(c.amountPence); } },
      { label: 'Remove', sr: true, get: function (c) { return removeButton('Remove', function () { global.DSQLINES.uncost(j, c); }); } }
    ], j.costs, { empty: 'No costs entered. Every line entered here reduces what is left to share.' });
  }

  function fillDays(j) {
    var block = el('w-days-block');
    block.hidden = j.model !== 'roofing';
    if (block.hidden) return;
    var mount = el('w-days');
    mount.textContent = '';
    var business = Q.business(j.site);
    var owners = Q.state.people.filter(function (p) {
      return p.businesses.some(function (b) { return b.slug === j.site; });
    });
    if (!owners.length) { mount.appendChild(U.node('p', 'empty', 'Nobody holds this business yet.')); return; }
    owners.forEach(function (p) {
      var have = j.ownerDays.filter(function (d) { return d.personId === p.id; })[0];
      var row = U.node('div', 'work-day');
      row.dataset.person = String(p.id);
      row.appendChild(U.node('span', 'work-day-name', p.name));
      var days = document.createElement('input');
      days.type = 'text'; days.inputMode = 'decimal'; days.autocomplete = 'off';
      days.setAttribute('aria-label', p.name + ', days'); days.placeholder = 'days';
      days.value = have ? String(have.days) : '';
      days.dataset.field = 'days';
      var rate = document.createElement('input');
      rate.type = 'text'; rate.inputMode = 'decimal'; rate.autocomplete = 'off';
      rate.setAttribute('aria-label', p.name + ', day rate in pounds'); rate.placeholder = 'rate £';
      rate.value = ((have ? have.dayRatePence : (business ? business.dayRatePence : 0)) / 100).toFixed(2);
      rate.dataset.field = 'rate';
      var wage = U.node('span', 'work-day-wage', have ? U.money(Math.round(have.days * have.dayRatePence)) : '');
      var set = U.node('button', 'pill', have ? 'Update' : 'Set');
      set.type = 'button';
      set.addEventListener('click', function () { global.DSQLINES.days(j, p.id, days.value, rate.value); });
      [days, rate, wage, set].forEach(function (n) { row.appendChild(n); });
      mount.appendChild(row);
    });
  }

  function fillPayments(j) {
    U.table(el('w-payments'), [
      { label: 'On', get: function (p) { return String(p.paidOn).slice(0, 10); } },
      { label: 'As', get: function (p) { return p.label; } },
      { label: '£', numeric: true, get: function (p) { return U.money(p.amountPence); } },
      { label: 'Remove', sr: true, get: function (p) {
        if (p.fromBank) return U.node('span', 'tag tag--accent', 'bank');
        return removeButton('Remove', function () { global.DSQLINES.unpay(j, p); });
      } }
    ], j.payments, { empty: 'Nothing received yet.' });
    var m = j.money;
    el('w-money').textContent = U.money(m.receivedPence) + ' of ' + U.money(m.invoicePence) + ' received'
      + (m.paidInFull ? ', paid in full' + (m.lastPaidOn ? ' on ' + String(m.lastPaidOn).slice(0, 10) : '') : ', ' + U.money(m.outstandingPence) + ' outstanding') + '.';
    el('w-pay-date').value = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
    el('w-pay-amount').value = m.outstandingPence > 0 ? (m.outstandingPence / 100).toFixed(2) : '';
    el('w-pay-label').value = j.payments.length ? 'balance' : 'deposit';
  }

  function fillDetails(j) {
    el('w-customer').value = j.customerName || '';
    el('w-postcode').value = j.customerPostcode || '';
    el('w-invoice').value = (j.invoiceNetPence / 100).toFixed(2);
    el('w-date').value = j.jobDate ? String(j.jobDate).slice(0, 10) : '';
    el('w-time').value = j.jobTime || '';
    el('w-status').value = j.status;
    Q.fillPeople(el('w-finder'), j.site, j.finderPersonId);
    el('w-note').value = j.note || '';
    /* While frozen the figure is a record. The lines and the invoice stay
       readable and the lines can still be added, since drift is reported, but
       the invoice itself is what was paid and only reopening changes it. */
    el('w-invoice').disabled = Boolean(j.frozen);
    el('w-status').disabled = Boolean(j.frozen);
    el('w-saved').textContent = '';
  }

  function fillFoot(j) {
    var note = el('w-freeze-note');
    var button = el('w-freeze');
    var reason = el('w-reason-row');
    var manage = Q.canManage(j.site);
    var admin = Q.state.me && Q.state.me.isAdmin;
    el('w-freeze-error').classList.remove('is-shown');
    el('w-reason').value = '';
    if (j.frozen) {
      reason.hidden = !admin;
      button.hidden = !admin;
      button.textContent = 'Reopen the payout';
      button.className = 'btn btn--ghost btn--sm';
      note.textContent = admin ? 'Reopening puts the figure back on the engine. Say why; it is kept against the stored rows.' : 'Frozen. An admin can reopen it with a reason.';
      return;
    }
    reason.hidden = true;
    button.hidden = !manage;
    button.textContent = 'Freeze the payout';
    button.className = 'btn btn--primary btn--sm';
    button.disabled = !j.money.paidInFull;
    note.textContent = !manage ? 'Whoever manages this business freezes the payout once the money is in.'
      : j.money.paidInFull ? 'The money is in. Freezing writes what each person is owed, as it stands now, and marks the job paid.'
        : 'The payout freezes once the money received covers the invoice. ' + U.money(Math.max(0, j.money.outstandingPence)) + ' to go.';
  }

  function fill(j) {
    el('w-name').textContent = j.customerName || 'No name';
    var sub = el('w-sub');
    sub.textContent = '';
    sub.appendChild(document.createTextNode(j.business + ' · ' + U.money(j.invoiceNetPence) + ' net' + (j.customerPostcode ? ' · ' + j.customerPostcode : '') + ' '));
    sub.appendChild(U.node('span', 'tag' + (STATUS_TONE[j.status] || ''), j.status));
    fillFigure(j);
    fillCosts(j);
    fillDays(j);
    fillPayments(j);
    fillDetails(j);
    fillFoot(j);
    if (global.DSQCONTRACT) global.DSQCONTRACT.fill(j);
    ['w-cost-error', 'w-days-error', 'w-pay-error', 'w-details-error'].forEach(function (id) { el(id).classList.remove('is-shown'); });
  }

  global.DSQJOB = { fill: fill };
})(window);
