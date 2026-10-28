/* The Time block on the job screen: clock in and out, "On my way" with
   roughly how long, miles driven, and for whoever manages the business the
   profit the time adds up to and each person's hourly rate. Built here and
   slotted in under Messages, like quoted-messages.js, so quoted.html stays
   the size it is. Every change is one op on /api/admin/quoted and the job
   that comes back is what is drawn. */
(function (global) {
  'use strict';

  var U = global.DSUI;
  var M = global.DSMSG;
  var Q = global.DSQ;
  var MINUTES = ['10', '20', '30', '45', '60'];

  var block = U.node('section', 'client-block time-block');
  block.setAttribute('aria-labelledby', 'h-time');
  var h = U.node('h3', null, 'Time, travel and profit');
  h.id = 'h-time';
  block.appendChild(h);
  var actions = U.node('div', 'work-add');
  var clock = U.node('button', 'btn btn--primary btn--sm', 'Clock in');
  clock.type = 'button';
  actions.appendChild(clock);
  var mins = document.createElement('select');
  mins.id = 'w-omw-mins';
  mins.setAttribute('aria-label', 'About how many minutes away');
  MINUTES.forEach(function (m) { mins.appendChild(new Option('About ' + m + ' minutes', m)); });
  mins.value = '20';
  var minsRow = U.node('div', 'form-row');
  minsRow.appendChild(mins);
  actions.appendChild(minsRow);
  block.appendChild(actions);
  var omw = U.node('div', 'msg-item');
  block.appendChild(omw);
  var milesForm = U.node('form', 'work-add');
  milesForm.noValidate = true;
  var milesRow = U.node('div', 'form-row');
  var milesLabel = U.node('label', null, 'Miles driven for this job');
  milesLabel.htmlFor = 'w-miles';
  var milesIn = document.createElement('input');
  milesIn.id = 'w-miles'; milesIn.type = 'text'; milesIn.inputMode = 'decimal'; milesIn.autocomplete = 'off';
  milesRow.appendChild(milesLabel); milesRow.appendChild(milesIn);
  var milesBtn = U.node('button', 'btn btn--ghost btn--sm', 'Add miles');
  milesBtn.type = 'submit';
  milesForm.appendChild(milesRow); milesForm.appendChild(milesBtn);
  block.appendChild(milesForm);
  var err = U.node('span', 'err');
  err.setAttribute('role', 'alert');
  block.appendChild(err);
  var tiles = U.node('div', 'tiles work-figure');
  block.appendChild(tiles);
  var entries = U.node('div');
  block.appendChild(entries);
  var rates = U.node('div');
  block.appendChild(rates);
  var anchor = document.querySelector('#job-dialog .msg-block') || document.querySelector('#job-dialog .quote-block');
  anchor.parentNode.insertBefore(block, anchor.nextSibling);

  var current = null;
  var me = function () { return Q.state.me && Q.state.me.personId; };

  async function op(body) {
    err.classList.remove('is-shown');
    var res;
    try { res = await U.send('/api/admin/quoted', body); } catch (e) { res = null; }
    if (!res || !res.ok) {
      var errors = (res && res.data && res.data.errors) || {};
      err.textContent = errors[Object.keys(errors)[0]] || 'That did not save. Try again.';
      err.classList.add('is-shown');
      return null;
    }
    Q.replace(res.data.job);
    global.DSQJOB.fill(res.data.job);
    return res.data.job;
  }

  clock.addEventListener('click', function () {
    if (!current) return;
    op({ op: current.time.open.indexOf(me()) === -1 ? 'clockin' : 'clockout', id: current.id });
  });
  mins.addEventListener('change', function () { if (current) fillOnMyWay(current); });
  milesForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var n = Number(String(milesIn.value).trim());
    if (!(n > 0)) { err.textContent = 'Miles as a number.'; err.classList.add('is-shown'); return; }
    if (await op({ op: 'miles', id: current.id, miles: n })) milesIn.value = '';
  });

  function fillOnMyWay(j) {
    omw.textContent = '';
    var m = j.onMyWay && j.onMyWay[mins.value];
    minsRow.hidden = !m;
    if (!m) return;
    var head = U.node('div', 'msg-head');
    head.appendChild(U.node('strong', null, 'On my way'));
    var when = M.lastSent(j.messages.sent, 'onmyway');
    if (when) head.appendChild(U.node('span', 'who', when));
    omw.appendChild(head);
    omw.appendChild(M.buttons(j.id, m, function (job) { Q.replace(job); global.DSQJOB.fill(job); }));
  }

  function fillProfit(j) {
    tiles.textContent = '';
    var p = j.profit;
    tiles.hidden = !p;
    if (!p) return;
    [['Price', U.money(p.pricePence)], ['Less materials and costs', '− ' + U.money(p.costsPence)],
      ['Less labour', '− ' + U.money(p.labourPence), p.labourHours + ' hours clocked'],
      [p.profitPence < 0 ? 'Loss, what is left' : 'Profit, what is left', U.money(p.profitPence), p.overBudget ? 'Over budget: costs and labour are ' + Math.round(p.spentBp / 100) + '% of the price' : null, true]
    ].forEach(function (t) {
      var d = U.node('div', 'tile' + (t[3] ? ' is-key' : ''));
      d.appendChild(U.node('span', 'k', t[0]));
      d.appendChild(U.node('span', 'v', t[1]));
      if (t[2]) d.appendChild(U.node('span', 's', t[2]));
      tiles.appendChild(d);
    });
  }

  function fillEntries(j) {
    var rows = j.time.entries.map(function (e) { return { kind: 'time', e: e }; })
      .concat(j.time.miles.map(function (m) { return { kind: 'miles', e: m }; }));
    U.table(entries, [
      { label: 'Who', get: function (r) { return r.e.name; } },
      { label: 'When', wrap: true, get: function (r) {
        if (r.kind === 'miles') return r.e.onDate;
        return U.when(r.e.startedAt) + (r.e.endedAt ? ' to ' + U.when(r.e.endedAt).slice(-5) : ', on site now');
      } },
      { label: 'Hours or miles', numeric: true, get: function (r) { return r.kind === 'miles' ? r.e.miles + ' mi' : r.e.hours + ' h'; } },
      { label: 'Remove', sr: true, get: function (r) {
        if (r.kind !== 'time' || !j.canSeeProfit) return '';
        var b = U.node('button', 'pill', 'Remove');
        b.type = 'button';
        b.addEventListener('click', function () { if (global.confirm('Remove this time?')) op({ op: 'untime', id: j.id, timeId: r.e.id }); });
        return b;
      } }
    ], rows, { empty: 'Nobody has clocked in on this job yet.' });
  }

  /* Hourly rates, for whoever manages the business: what prices the labour. */
  function fillRates(j) {
    rates.textContent = '';
    if (!j.canSeeProfit) return;
    var people = Q.state.people.filter(function (p) {
      return p.hourlyRatePence !== undefined && p.businesses.some(function (b) { return b.slug === j.site; });
    });
    if (!people.length) return;
    rates.appendChild(U.node('p', 'panel-note', 'Changes every job\'s labour, this one too.'));
    people.forEach(function (p) {
      var row = U.node('div', 'work-day');
      row.appendChild(U.node('span', 'work-day-name', p.name));
      var input = document.createElement('input');
      input.type = 'text'; input.inputMode = 'decimal'; input.autocomplete = 'off';
      input.setAttribute('aria-label', p.name + ', hourly rate in pounds');
      input.value = (p.hourlyRatePence / 100).toFixed(2);
      var set = U.node('button', 'pill', 'Set rate');
      set.type = 'button';
      set.addEventListener('click', async function () {
        var pence = U.toPence(input.value);
        if (pence === null) return;
        if (await op({ op: 'rate', id: j.id, personId: p.id, hourlyRatePence: pence })) p.hourlyRatePence = pence;
      });
      [input, U.node('span', 'work-day-wage', 'an hour'), set].forEach(function (n) { row.appendChild(n); });
      rates.appendChild(row);
    });
  }

  function fill(j) {
    current = j;
    err.classList.remove('is-shown');
    var on = j.time.open.indexOf(me()) !== -1;
    clock.hidden = !me();
    clock.textContent = on ? 'Clock out' : 'Clock in';
    clock.className = 'btn btn--sm ' + (on ? 'btn--ghost' : 'btn--primary');
    milesForm.hidden = !me();
    fillOnMyWay(j);
    fillProfit(j);
    fillEntries(j);
    fillRates(j);
  }

  global.DSQTIME = { fill: fill };
})(window);
