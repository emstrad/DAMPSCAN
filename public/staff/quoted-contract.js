/* The service contract block on an air conditioning job's working screen.
   An install starts a relationship: this is where its interval and next
   service live, and where a reminder or a service is recorded. Loaded after
   quoted-job.js, which calls fill(job) on every redraw. */
(function (global) {
  'use strict';

  var U = global.DSUI;
  var el = function (id) { return document.getElementById(id); };
  var current = { job: null, contract: null };

  function fail(message) {
    var err = el('w-contract-error');
    err.textContent = message;
    err.classList.add('is-shown');
  }

  function describe(c) {
    var bits = [];
    bits.push('Next service due ' + c.nextDueOn + (c.daysUntilDue < 0 ? ', ' + Math.abs(c.daysUntilDue) + ' days overdue' : c.daysUntilDue === 0 ? ', today' : ', in ' + c.daysUntilDue + ' days'));
    bits.push('every ' + c.intervalMonths + ' months');
    bits.push(c.unitCount + (c.unitCount === 1 ? ' unit' : ' units') + (c.refrigerantKg ? ', ' + c.refrigerantKg + ' kg refrigerant' : ''));
    if (c.installedOn) bits.push('installed ' + c.installedOn);
    if (c.lastServicedOn) bits.push('last serviced ' + c.lastServicedOn);
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
      el('w-contract-save').textContent = 'Update contract';
    } else {
      summary.hidden = true;
      el('w-contract-status').hidden = true;
      el('w-contract-actions').hidden = true;
      el('w-contract-interval').value = '12';
      el('w-contract-units').value = '1';
      el('w-contract-kg').value = '';
      el('w-contract-due').value = '';
      el('w-contract-save').textContent = 'Start a contract';
    }
    form.hidden = false;
  }

  async function fill(job) {
    var block = el('w-contract-block');
    block.hidden = job.model !== 'ac';
    if (block.hidden) return;
    current.job = job;
    current.contract = null;
    try {
      var data = await U.get('/api/admin/contracts?jobId=' + job.id);
      current.contract = (data.contracts || [])[0] || null;
    } catch (e) { /* the block simply offers to start one */ }
    if (current.job === job) render();
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
  }

  el('w-contract-form').addEventListener('submit', function (e) {
    e.preventDefault();
    el('w-contract-saved').textContent = '';
    var job = current.job;
    var c = current.contract;
    send({
      op: 'save', id: c ? c.id : undefined, site: job.site, jobId: job.id,
      intervalMonths: Number(el('w-contract-interval').value), unitCount: Number(el('w-contract-units').value),
      refrigerantKg: el('w-contract-kg').value || null, nextDueOn: el('w-contract-due').value || null
    }, 'The contract could not be saved.');
  });
  el('w-contract-contacted').addEventListener('click', function () { send({ op: 'contacted', id: current.contract.id }, 'Could not record that.'); });
  el('w-contract-serviced').addEventListener('click', function () {
    if (!global.confirm('Record a service today and move the next one on by ' + current.contract.intervalMonths + ' months?')) return;
    send({ op: 'serviced', id: current.contract.id }, 'Could not record the service.');
  });

  global.DSQCONTRACT = { fill: fill };
})(window);
