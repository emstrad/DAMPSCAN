/* The forms on the working screen: a cost, an owner's days, a payment, the
   details, and the freeze. Each sends one op, and the job the server returns
   is what the dialog and the list are redrawn from, so what is on screen is
   always what was stored and never a local guess. Loads last and fires the
   first load. */
(function (global) {
  'use strict';

  var U = global.DSUI;
  var Q = global.DSQ;
  var el = function (id) { return document.getElementById(id); };

  function fail(id, res, fallback) {
    var errors = (res && res.data && res.data.errors) || {};
    var first = Object.keys(errors)[0];
    var err = el(id);
    err.textContent = first ? errors[first] : fallback;
    err.classList.add('is-shown');
  }

  /** Sends one op for the open job and redraws from the answer. */
  async function op(errorId, body, fallback) {
    el(errorId).classList.remove('is-shown');
    var res;
    try {
      res = await U.send('/api/admin/quoted', body);
    } catch (e) {
      fail(errorId, null, e.message || fallback);
      return null;
    }
    if (!res.ok) { fail(errorId, res, fallback); return null; }
    Q.replace(res.data.job);
    global.DSQJOB.fill(res.data.job);
    return res.data.job;
  }

  /* ---------- costs ---------- */
  el('w-cost-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var amount = U.toPence(el('w-cost-amount').value);
    if (amount === null || !el('w-cost-label').value.trim()) { fail('w-cost-error', null, 'A cost needs a label and a figure in pounds.'); return; }
    var job = await op('w-cost-error', { op: 'cost', id: Q.state.open.id, label: el('w-cost-label').value.trim(), amountPence: amount }, 'That cost could not be added.');
    if (job) { el('w-cost-label').value = ''; el('w-cost-amount').value = ''; el('w-cost-label').focus(); }
  });

  async function uncost(job, cost) {
    if (!global.confirm('Remove ' + cost.label + ', ' + U.money(cost.amountPence) + '?')) return;
    await op('w-cost-error', { op: 'uncost', id: job.id, costId: cost.id }, 'That cost could not be removed.');
  }

  /* ---------- owners' days ---------- */
  async function days(job, personId, daysText, rateText) {
    var n = Number(String(daysText).trim() || 0);
    var rate = U.toPence(rateText);
    if (!(n >= 0) || rate === null) { fail('w-days-error', null, 'Days and a day rate, as numbers.'); return; }
    await op('w-days-error', { op: 'days', id: job.id, personId: personId, days: n, dayRatePence: rate }, 'Those days could not be saved.');
  }

  /* ---------- payments ---------- */
  el('w-pay-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var amount = U.toPence(el('w-pay-amount').value);
    if (amount === null || amount === 0) { fail('w-pay-error', null, 'How much was received, in pounds.'); return; }
    var label = el('w-pay-label').value;
    /* A refund is money going the other way, and is entered as a positive
       figure because that is how it reads on a statement. */
    if (label === 'refund' && amount > 0) amount = -amount;
    await op('w-pay-error', { op: 'payment', id: Q.state.open.id, amountPence: amount, label: label, paidOn: el('w-pay-date').value || undefined }, 'That payment could not be recorded.');
  });

  async function unpay(job, payment) {
    if (!global.confirm('Remove the ' + payment.label + ' of ' + U.money(payment.amountPence) + ' on ' + String(payment.paidOn).slice(0, 10) + '?')) return;
    await op('w-pay-error', { op: 'unpay', id: job.id, paymentId: payment.id }, 'That payment could not be removed.');
  }

  /* ---------- details ---------- */
  el('w-details').addEventListener('submit', async function (e) {
    e.preventDefault();
    var open = Q.state.open;
    var invoice = U.toPence(el('w-invoice').value);
    if (invoice === null) { fail('w-details-error', null, 'The invoice must be a number.'); return; }
    var job = await op('w-details-error', {
      op: 'save', id: open.id, site: open.site,
      customerName: el('w-customer').value, customerPostcode: el('w-postcode').value,
      invoiceNetPence: open.frozen ? open.invoiceNetPence : invoice,
      jobDate: el('w-date').value || undefined, jobTime: el('w-time').value || null,
      status: open.frozen ? open.status : el('w-status').value,
      finderPersonId: el('w-finder').value || null, note: el('w-note').value
    }, 'The details could not be saved.');
    if (job) el('w-saved').textContent = 'Saved';
  });

  /* ---------- freeze and reopen ---------- */
  el('w-freeze-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var open = Q.state.open;
    if (open.frozen) {
      var reason = el('w-reason').value.trim();
      if (!reason) { fail('w-freeze-error', null, 'Say why the stored figure is being reopened.'); return; }
      if (!global.confirm('Reopen the payout on ' + (open.customerName || 'this job') + '? The stored figure goes back to being worked out live.')) return;
      await op('w-freeze-error', { op: 'unfreeze', id: open.id, reason: reason }, 'It could not be reopened.');
      return;
    }
    var rows = open.payoutRows.map(function (r) { return Q.rowName(r) + ' ' + U.money(r.amountPence); }).join(', ');
    if (!global.confirm('Freeze the payout on ' + (open.customerName || 'this job') + '? ' + (rows || 'Nobody is owed anything.') + ' This marks the job paid.')) return;
    await op('w-freeze-error', { op: 'freeze', id: open.id }, 'It could not be frozen.');
  });

  /* Focus goes back to the button that opened the dialog, or its redrawn
     twin, so a keyboard user is where they were and not at the top. */
  el('job-dialog').addEventListener('close', function () {
    var id = Q.state.open ? Q.state.open.id : null;
    var button = id != null ? document.querySelector('#jobs button[data-id="' + id + '"]') : null;
    if (button) button.focus();
    Q.state.open = null;
    Q.state.opener = null;
  });

  global.DSQLINES = { uncost: uncost, days: days, unpay: unpay };

  Q.refresh();
})(window);
