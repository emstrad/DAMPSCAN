/* The job form, the live split preview, and the rate card editor.
   Loads after jobs.js and owns the first data load, so both files are parsed
   before anything renders. */
(function (global) {
  'use strict';

  var U = global.DSUI;
  var J = global.DSJOBS;
  var el = function (id) { return document.getElementById(id); };

  /* ---------- the same waterfall the server uses ----------
     For immediate feedback while typing only. The figure that gets stored is
     always the one the server calculates and returns, so the two can never
     drift into disagreeing about what was actually paid. */
  function bpOf(pence, bp) {
    var exact = (pence * bp) / 10000;
    return exact < 0 ? -Math.round(-exact) : Math.round(exact);
  }

  function split(input) {
    var s = J.state.settings;
    var afterTax = input.price - bpOf(input.price, s.taxBp);
    var lead = bpOf(afterTax, s.leadBp);
    var remainder = afterTax - lead - input.fee;
    var second = Math.trunc(remainder / 2);

    var remAfterTax = input.remedial - bpOf(input.remedial, s.taxBp);
    var remLead = bpOf(remAfterTax, s.leadBp);

    var pay = { scott: 0, tom: 0, ben: 0 };
    pay[s.leadEarner] += lead + remLead;
    pay[input.surveyor] += input.fee;
    pay[s.partners[0]] += remainder - second;
    pay[s.partners[1]] += second;

    return {
      afterTax: afterTax, lead: lead, remainder: remainder, pay: pay,
      remedialLead: remLead, remedialOffline: remAfterTax - remLead
    };
  }

  function read() {
    return {
      price: U.toPence(el('j-price').value),
      fee: U.toPence(el('j-fee').value),
      remedial: U.toPence(el('j-remedial').value),
      surveyor: el('j-surveyor').value
    };
  }

  function renderPreview() {
    var mount = el('preview');
    var input = read();
    if (!J.state.settings || input.price === null || input.fee === null || input.remedial === null) {
      mount.textContent = '';
      return;
    }
    var c = split(input);
    mount.textContent = '';

    var line = U.node('div', 'preview-line');
    [['After tax', c.afterTax], ['Lead fee', c.lead], ['Surveyor', input.fee], ['Left to split', c.remainder]]
      .forEach(function (pair) {
        var cell = U.node('span', 'preview-cell');
        cell.appendChild(U.node('span', 'k', pair[0]));
        cell.appendChild(U.node('span', 'v', U.money(pair[1])));
        line.appendChild(cell);
      });
    mount.appendChild(line);

    var pay = U.node('div', 'preview-line');
    J.PEOPLE.forEach(function (p) {
      var cell = U.node('span', 'preview-cell is-key');
      cell.appendChild(U.node('span', 'k', p.name));
      cell.appendChild(U.node('span', 'v', U.money(c.pay[p.key])));
      pay.appendChild(cell);
    });
    mount.appendChild(pay);

    var s = J.state.settings;
    if (input.remedial > 0) {
      mount.appendChild(U.node('p', 'panel-note',
        'Remedial: ' + U.money(c.remedialLead) + ' lead fee to ' + J.name(s.leadEarner) + '. '
        + U.money(c.remedialOffline) + ' after tax is settled offline between '
        + J.name(s.partners[0]) + ' and ' + J.name(s.partners[1]) + '.'));
    }
    if (c.remainder < 0) {
      mount.appendChild(U.node('p', 'panel-note',
        'This job costs more than it earns. The split is shown negative rather than hidden.'));
    }
  }

  /* ---------- form ---------- */
  function fillRateDefaults() {
    var key = el('j-type').value;
    J.state.rates.forEach(function (rate) {
      if (rate.key !== key) return;
      el('j-price').value = (rate.pricePence / 100).toFixed(2);
      el('j-fee').value = (rate.surveyorFeePence / 100).toFixed(2);
    });
  }

  function load(job) {
    el('j-id').value = job ? job.id : '';
    el('j-lead').value = job && job.leadId ? String(job.leadId) : '';
    el('j-date').value = job ? String(job.jobDate).slice(0, 10) : new Date().toISOString().slice(0, 10);
    el('j-name').value = job ? (job.customerName || '') : '';
    el('j-postcode').value = job ? (job.customerPostcode || '') : '';
    el('j-site').value = job ? job.site : (J.state.site || 'dampscan');
    el('j-type').value = job ? (job.surveyType || '') : (J.state.rates[0] ? J.state.rates[0].key : '');
    el('j-surveyor').value = job ? job.surveyor : 'tom';
    el('j-status').value = job ? job.status : 'booked';
    el('j-note').value = job ? (job.note || '') : '';

    if (job) {
      el('j-price').value = (job.surveyPricePence / 100).toFixed(2);
      el('j-fee').value = (job.surveyorFeePence / 100).toFixed(2);
      el('j-remedial').value = (job.remedialPence / 100).toFixed(2);
    } else {
      el('j-remedial').value = '0';
      fillRateDefaults();
    }

    el('j-save').textContent = job ? 'Update job' : 'Save job';
    el('job-error').classList.remove('is-shown');
    renderPreview();
    if (job) el('job-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function fail(id, message) {
    var err = el(id);
    err.textContent = message;
    err.classList.add('is-shown');
  }

  async function save(e) {
    e.preventDefault();
    el('job-error').classList.remove('is-shown');

    var input = read();
    if (input.price === null || input.fee === null || input.remedial === null) {
      fail('job-error', 'Amounts must be numbers.');
      return;
    }

    var res = await U.send('/api/admin/jobs', {
      id: el('j-id').value || undefined,
      leadId: el('j-lead').value || undefined,
      site: el('j-site').value,
      jobDate: el('j-date').value || undefined,
      customerName: el('j-name').value,
      customerPostcode: el('j-postcode').value,
      note: el('j-note').value,
      surveyType: el('j-type').value || null,
      surveyPricePence: input.price,
      surveyorFeePence: input.fee,
      surveyor: input.surveyor,
      remedialPence: input.remedial,
      status: el('j-status').value
    });

    if (!res.ok) {
      var errors = (res.data && res.data.errors) || {};
      var first = Object.keys(errors)[0];
      fail('job-error', first ? errors[first] : 'That job could not be saved.');
      return;
    }
    load(null);
    await J.refresh();
  }

  /* ---------- rate card ---------- */
  function renderRates() {
    var mount = el('rate-rows');
    mount.textContent = '';
    J.state.rates.forEach(function (rate) {
      var row = U.node('div', 'jgrid rate-row');
      row.dataset.key = rate.key;
      [['Survey', 'label', rate.label, false],
        ['Price £', 'price', (rate.pricePence / 100).toFixed(2), true],
        ['Surveyor fee £', 'fee', (rate.surveyorFeePence / 100).toFixed(2), true]]
        .forEach(function (field) {
          var id = 'rate-' + rate.key + '-' + field[1];
          var wrap = U.node('div', 'form-row');
          var lab = U.node('label', null, field[0]);
          lab.setAttribute('for', id);
          var input = document.createElement('input');
          input.id = id;
          input.type = 'text';
          input.value = field[2];
          input.dataset.field = field[1];
          if (field[3]) input.inputMode = 'decimal';
          wrap.appendChild(lab);
          wrap.appendChild(input);
          row.appendChild(wrap);
        });
      mount.appendChild(row);
    });
    el('r-tax').value = String(J.state.settings.taxBp / 100);
    el('r-lead').value = String(J.state.settings.leadBp / 100);
  }

  async function saveRates(e) {
    e.preventDefault();
    el('rates-error').classList.remove('is-shown');

    var rates = [];
    var bad = false;
    Array.prototype.forEach.call(document.querySelectorAll('.rate-row'), function (row, index) {
      var value = function (f) { return row.querySelector('[data-field="' + f + '"]').value; };
      var price = U.toPence(value('price'));
      var fee = U.toPence(value('fee'));
      if (price === null || fee === null) { bad = true; return; }
      rates.push({
        key: row.dataset.key, label: value('label'),
        pricePence: price, surveyorFeePence: fee, position: index + 1
      });
    });

    var taxBp = Math.round(Number(el('r-tax').value) * 100);
    var leadBp = Math.round(Number(el('r-lead').value) * 100);
    if (bad || !Number.isFinite(taxBp) || !Number.isFinite(leadBp)) {
      fail('rates-error', 'Every amount and percentage must be a number.');
      return;
    }

    var s = J.state.settings;
    var res = await U.send('/api/admin/rates', {
      rates: rates,
      settings: { taxBp: taxBp, leadBp: leadBp, leadEarner: s.leadEarner, partners: s.partners }
    });
    if (!res.ok) {
      var errors = (res.data && res.data.errors) || {};
      var first = Object.keys(errors)[0];
      fail('rates-error', first ? errors[first] : 'The rate card could not be saved.');
      return;
    }
    await J.refresh();
  }

  /* ---------- wiring ---------- */
  function fillLeadPicker() {
    var select = el('j-lead');
    var taken = {};
    J.state.jobs.forEach(function (j) { if (j.leadId) taken[j.leadId] = true; });
    var chosen = select.value;
    select.textContent = '';
    select.appendChild(new Option('Phone or manual', ''));
    J.state.leads.forEach(function (l) {
      if (taken[l.id] && String(l.id) !== chosen) return;
      select.appendChild(new Option(
        l.firstName + ', ' + l.postcode + ' (' + U.when(l.createdAt) + ')', String(l.id)
      ));
    });
    select.value = chosen;
  }

  J.onData(function () {
    var chosen = el('j-type').value;
    el('j-type').textContent = '';
    J.state.rates.forEach(function (r) { el('j-type').appendChild(new Option(r.label, r.key)); });
    el('j-type').appendChild(new Option('One off price', ''));
    if (chosen) el('j-type').value = chosen;

    J.renderJobs(load);
    fillLeadPicker();
    renderRates();
    if (!el('j-date').value) load(null);
    renderPreview();
  });

  el('j-type').addEventListener('change', function () { fillRateDefaults(); renderPreview(); });
  el('j-surveyor').addEventListener('change', renderPreview);
  ['j-price', 'j-fee', 'j-remedial'].forEach(function (id) {
    el(id).addEventListener('input', renderPreview);
  });

  el('j-lead').addEventListener('change', function () {
    var id = el('j-lead').value;
    J.state.leads.forEach(function (l) {
      if (String(l.id) !== id) return;
      el('j-name').value = l.firstName || '';
      el('j-postcode').value = l.postcode || '';
      el('j-site').value = l.site || 'dampscan';
    });
  });

  el('job-form').addEventListener('submit', save);
  el('rates-form').addEventListener('submit', saveRates);
  el('j-reset').addEventListener('click', function () { load(null); });

  J.refresh();
})(window);
