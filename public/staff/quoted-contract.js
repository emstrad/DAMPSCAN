/* The service contract block on a job's working screen: an air conditioning
   service contract for CoolRight, a maintenance plan (the yearly roof and
   gutter check) for Verge. A finished job starts a relationship: this is
   where its interval, next visit and price live, and where a reminder or a
   visit is recorded. Loaded after
   quoted-job.js, which calls fill(job) on every redraw. */
(function (global) {
  'use strict';

  var U = global.DSUI;
  var el = function (id) { return document.getElementById(id); };
  var current = { job: null, contract: null };
  var roofing = function () { return current.job && current.job.model === 'roofing'; };
  var WORDS = {
    ac: { heading: 'Service contract', start: 'Start a contract', update: 'Update contract', visit: 'service', done: 'Serviced today' },
    roofing: { heading: 'Maintenance plan', start: 'Start a maintenance plan', update: 'Update plan', visit: 'roof and gutter check', done: 'Checked today' }
  };
  var words = function () { return WORDS[roofing() ? 'roofing' : 'ac']; };

  /* A price per visit, for both trades; added here so quoted.html keeps its size. */
  var priceRow = U.node('div', 'form-row');
  var priceLabel = U.node('label', null, 'Price per visit £');
  priceLabel.htmlFor = 'w-contract-price';
  var priceInput = document.createElement('input');
  priceInput.id = 'w-contract-price';
  priceInput.type = 'text';
  priceInput.inputMode = 'decimal';
  priceInput.autocomplete = 'off';
  priceRow.appendChild(priceLabel);
  priceRow.appendChild(priceInput);
  el('w-contract-due').parentNode.parentNode.insertBefore(priceRow, el('w-contract-save'));
  var rowOf = function (id) { return el(id).parentNode; };

  function fail(message) {
    var err = el('w-contract-error');
    err.textContent = message;
    err.classList.add('is-shown');
  }

  function describe(c) {
    var bits = [];
    bits.push('Next ' + words().visit + ' due ' + c.nextDueOn + (c.daysUntilDue < 0 ? ', ' + Math.abs(c.daysUntilDue) + ' days overdue' : c.daysUntilDue === 0 ? ', today' : ', in ' + c.daysUntilDue + ' days'));
    bits.push('every ' + c.intervalMonths + ' months');
    if (!roofing()) bits.push(c.unitCount + (c.unitCount === 1 ? ' unit' : ' units') + (c.refrigerantKg ? ', ' + c.refrigerantKg + ' kg refrigerant' : ''));
    if (c.pricePence != null) bits.push(U.money(c.pricePence) + ' a visit');
    if (c.installedOn) bits.push('installed ' + c.installedOn);
    if (c.lastServicedOn) bits.push((roofing() ? 'last checked ' : 'last serviced ') + c.lastServicedOn);
    if (c.lastContactedOn) bits.push('last reminded ' + c.lastContactedOn);
    return bits.join(' · ') + '.';
  }

  function render() {
    var c = current.contract;
    var summary = el('w-contract-summary');
    var form = el('w-contract-form');
    el('w-contract-error').classList.remove('is-shown');
    if (c) {
      summary.textContent = describe(c);
      summary.hidden = false;
      el('w-contract-status').textContent = c.status;
      el('w-contract-status').className = 'tag ' + (c.status === 'active' ? (c.daysUntilDue < 0 ? 'tag--warn' : 'tag--good') : 'tag--muted');
      el('w-contract-status').hidden = false;
      el('w-contract-actions').hidden = false;
      el('w-contract-interval').value = String(c.intervalMonths);
      el('w-contract-units').value = String(c.unitCount);
      el('w-contract-kg').value = c.refrigerantKg == null ? '' : String(c.refrigerantKg);
      el('w-contract-due').value = c.nextDueOn || '';
      priceInput.value = c.pricePence == null ? '' : (c.pricePence / 100).toFixed(2);
      el('w-contract-save').textContent = words().update;
    } else {
      summary.hidden = true;
      el('w-contract-status').hidden = true;
      el('w-contract-actions').hidden = true;
      el('w-contract-interval').value = '12';
      el('w-contract-units').value = '1';
      el('w-contract-kg').value = '';
      el('w-contract-due').value = '';
      priceInput.value = '';
      el('w-contract-save').textContent = words().start;
    }
    form.hidden = false;
  }

  async function fill(job) {
    var block = el('w-contract-block');
    block.hidden = job.model !== 'ac' && job.model !== 'roofing';
    if (block.hidden) return;
    current.job = job;
    /* A roof has no indoor units or refrigerant. */
    rowOf('w-contract-units').hidden = roofing();
    rowOf('w-contract-kg').hidden = roofing();
    el('h-contract').firstChild.textContent = words().heading + ' ';
    el('w-contract-serviced').textContent = words().done;
    current.contract = null;
    try {
      var data = await U.get('/api/admin/contracts?jobId=' + job.id);
      current.contract = (data.contracts || [])[0] || null;
    } catch (e) { /* the block simply offers to start one */ }
    if (current.job === job) render();
  }

  /* Serviced moves the due date on and clears a booked visit, so it gets the
     same five seconds to take it back as every other one-tap action. */
  function undoToast(words, undo, done) {
    var old = document.querySelector('.undo-toast'); if (old) old.remove();
    var box = U.node('div', 'undo-toast'); box.setAttribute('role', 'status');
    box.appendChild(U.node('span', null, words));
    var timer = setTimeout(function () { box.remove(); }, 5000);
    var b = U.node('button', null, 'Undo'); b.type = 'button';
    b.addEventListener('click', async function () {
      clearTimeout(timer); box.remove();
      try { await U.send('/api/admin/contracts', undo); } catch (e) { /* the refresh shows the truth */ }
      done();
    });
    box.appendChild(b);
    (document.querySelector('dialog[open]') || document.body).appendChild(box);
  }

  async function send(body, fallback) {
    var res;
    try { res = await U.send('/api/admin/contracts', body); } catch (e) { fail(e.message || fallback); return; }
    if (!res.ok) {
      var errors = (res.data && res.data.errors) || {};
      var first = Object.keys(errors)[0];
      fail(first ? errors[first] : fallback);
      return;
    }
    current.contract = res.data.contract || null;
    render();
    el('w-contract-saved').textContent = 'Saved';
    if (res.data.undo) undoToast('Service recorded.', res.data.undo, function () { fill(current.job); });
  }

  el('w-contract-form').addEventListener('submit', function (e) {
    e.preventDefault();
    el('w-contract-saved').textContent = '';
    var job = current.job;
    var c = current.contract;
    send({
      op: 'save', id: c ? c.id : undefined, site: job.site, jobId: job.id,
      intervalMonths: Number(el('w-contract-interval').value), unitCount: Number(el('w-contract-units').value),
      refrigerantKg: roofing() ? null : el('w-contract-kg').value || null, nextDueOn: el('w-contract-due').value || null,
      pricePence: priceInput.value.trim() ? U.toPence(priceInput.value) : null
    }, 'The contract could not be saved.');
  });
  el('w-contract-contacted').addEventListener('click', function () { send({ op: 'contacted', id: current.contract.id }, 'Could not record that.'); });
  el('w-contract-serviced').addEventListener('click', function () {
    if (!global.confirm('Record a service today and move the next one on by ' + current.contract.intervalMonths + ' months?')) return;
    send({ op: 'serviced', id: current.contract.id }, 'Could not record the service.');
  });

  global.DSQCONTRACT = { fill: fill };
})(window);
