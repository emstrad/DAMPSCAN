/* The CoolRight block on a job's working screen: the pipeline stage with its
   next move, the kit order, every unit fitted (make, model, serial,
   refrigerant and charge, warranty, where it is), the commissioning and
   F-gas record, and "Add service plan" once the kit is on the wall. Photos
   of the commissioning go in the job's own photos, one jump down. Writes go
   to /api/admin/coolright; the stage and commissioning ones offer Undo. */
(function (global) {
  'use strict';

  var U = global.DSUI;
  var A = global.DSAC;
  var current = null;
  var lastStatus = null;
  var block = U.node('section', 'client-block rp-block');
  block.setAttribute('aria-labelledby', 'ac-kit');
  block.hidden = true;
  var h = U.node('h3', null, 'Install, units and F-gas');
  h.id = 'ac-kit';
  block.appendChild(h);
  var body = U.node('div');
  var err = U.node('span', 'err');
  err.setAttribute('role', 'alert');
  block.appendChild(body);
  block.appendChild(err);
  var anchor = document.querySelector('.rp-block') || document.querySelector('.rq-block') || document.querySelector('.work-figure');
  anchor.parentNode.insertBefore(block, anchor.nextSibling);

  function fail(m) { err.textContent = m; err.classList.add('is-shown'); }
  function reload() { load(current, true); }
  async function send(payload, words) {
    err.classList.remove('is-shown');
    try { await A.write(payload, words, reload); reload(); } catch (e) { fail(e.message); }
  }
  function btn(text, cls, fn) { var b = U.node('button', 'btn btn--sm ' + (cls || 'btn--ghost'), text); b.type = 'button'; b.addEventListener('click', fn); return b; }
  function input(label, type, value, extra) {
    var l = U.node('label', extra && extra.wide ? 'ac-wide' : null, label);
    var i = document.createElement(type === 'select' ? 'select' : 'input');
    if (type !== 'select') { i.type = type; i.value = value == null ? '' : String(value); }
    if (type === 'text') i.autocomplete = 'off';
    if (extra && extra.mode) i.inputMode = extra.mode;
    l.appendChild(i);
    return { label: l, input: i };
  }

  function stageItem(card) {
    var item = U.node('div', 'rp-item');
    var row = U.node('div', 'rp-row');
    row.appendChild(U.node('span', 'sv-badge', A.NAMES[card.stage]));
    row.appendChild(U.node('strong', null, card.next));
    (card.badges || []).forEach(function (b) { row.appendChild(A.badge(b)); });
    item.appendChild(row);
    var acts = U.node('div', 'rp-row');
    var go = function (to, text, cls) { acts.appendChild(btn(text, cls, async function () { try { if (await A.move(card, to, reload)) reload(); } catch (e) { fail(e.message); } })); };
    if (A.NEXT[card.stage] && !card.frozen) go(A.NEXT[card.stage][0], A.NEXT[card.stage][1], 'btn--primary');
    if (card.stage === 'quoted') go('survey', 'Book a survey');
    if (card.stage === 'accepted') acts.appendChild(btn(card.status === 'booked' ? 'Move install date' : 'Book install date', null, async function () { try { if (await A.installDate(card, reload)) reload(); } catch (e) { fail(e.message); } }));
    if (A.BACK[card.stage] && !card.frozen) go(A.BACK[card.stage], 'Back to ' + A.NAMES[A.BACK[card.stage]].toLowerCase());
    var board = U.node('a', 'btn btn--ghost btn--sm', 'On the board');
    board.href = '/staff/coolright.html?area=ac#job-' + card.id;
    acts.appendChild(board);
    item.appendChild(acts);
    return item;
  }

  function kitItem(card) {
    var item = U.node('div', 'rp-item');
    item.appendChild(U.node('h4', null, 'Kit'));
    var row = U.node('div', 'rp-row');
    var status = document.createElement('select');
    status.setAttribute('aria-label', 'Kit status');
    [['needed', 'Not ordered'], ['ordered', 'Ordered'], ['delivered', 'Delivered'], ['not_needed', 'Not needed']].forEach(function (s) { status.appendChild(new Option(s[1], s[0], false, s[0] === card.kit)); });
    var supplier = document.createElement('input'); supplier.type = 'text'; supplier.placeholder = 'Supplier'; supplier.setAttribute('aria-label', 'Kit supplier');
    var cost = document.createElement('input'); cost.type = 'text'; cost.inputMode = 'decimal'; cost.className = 'rp-cost'; cost.placeholder = 'Cost £'; cost.setAttribute('aria-label', 'Kit cost in pounds');
    var save = btn('Save', null, function () {
      var body = { op: 'kit', id: card.id, status: status.value };
      if (supplier.value.trim()) body.supplier = supplier.value;
      if (cost.value.trim()) body.costPence = U.toPence(cost.value);
      send(body, 'Kit saved.');
    });
    [status, supplier, cost, save].forEach(function (n) { row.appendChild(n); });
    item.appendChild(row);
    return item;
  }

  var UNIT_FIELDS = [['side', 'Indoor or outdoor', 'select'], ['make', 'Make', 'text'], ['model', 'Model', 'text'], ['serial', 'Serial number', 'text'],
    ['refrigerant', 'Refrigerant (e.g. R32)', 'text'], ['chargeKg', 'Charge kg', 'text'], ['installedOn', 'Installed', 'date'], ['warrantyUntil', 'Warranty until', 'date'],
    ['location', 'Where in the property', 'text'], ['note', 'Notes', 'text']];

  function unitForm(card, u, done) {
    var f = U.node('form', 'ac-form');
    var inputs = {};
    UNIT_FIELDS.forEach(function (d) {
      var x = input(d[1], d[2], u ? u[d[0]] : (d[0] === 'installedOn' ? card.jobDate : null), { wide: d[0] === 'note', mode: d[0] === 'chargeKg' ? 'decimal' : null });
      if (d[0] === 'side') { x.input.appendChild(new Option('Indoor', 'indoor')); x.input.appendChild(new Option('Outdoor', 'outdoor')); x.input.value = u ? u.side : 'indoor'; }
      inputs[d[0]] = x.input;
      f.appendChild(x.label);
    });
    var bar = U.node('div', 'rp-row ac-wide');
    var ok = U.node('button', 'btn btn--primary btn--sm', u ? 'Save unit' : 'Add unit');
    ok.type = 'submit';
    bar.appendChild(ok);
    bar.appendChild(btn('Cancel', null, done));
    f.appendChild(bar);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var b = { op: 'unit', id: card.id };
      if (u) b.unitId = u.id;
      Object.keys(inputs).forEach(function (k) { b[k] = inputs[k].value; });
      send(b, u ? 'Unit saved.' : 'Unit added.');
    });
    return f;
  }

  function unitsItem(card, units) {
    var item = U.node('div', 'rp-item');
    item.appendChild(U.node('h4', null, 'Units (' + units.length + ')'));
    var list = U.node('div', 'ac-units');
    units.forEach(function (u) {
      var box = U.node('div', 'ac-unit');
      box.appendChild(U.node('strong', null, (u.side === 'outdoor' ? 'Outdoor: ' : 'Indoor: ') + ([u.make, u.model].filter(Boolean).join(' ') || 'make not recorded')));
      box.appendChild(U.node('p', 'who', [u.location, u.serial ? 'serial ' + u.serial : null, [u.refrigerant, u.chargeKg != null ? u.chargeKg + ' kg' : null].filter(Boolean).join(' '),
        u.installedOn ? 'fitted ' + u.installedOn : null, u.warrantyUntil ? 'warranty to ' + u.warrantyUntil : null, u.note].filter(Boolean).join(' · ') || 'No details yet.'));
      var row = U.node('div', 'rp-row');
      row.appendChild(btn('Edit', null, function () { box.textContent = ''; box.appendChild(unitForm(card, u, reload)); }));
      row.appendChild(btn('Remove', null, function () { if (global.confirm('Remove this unit from the record?')) send({ op: 'unit', id: card.id, unitId: u.id, remove: true }, 'Unit removed.'); }));
      box.appendChild(row);
      list.appendChild(box);
    });
    item.appendChild(list);
    var add = btn('+ Add a unit', null, function () { add.replaceWith(unitForm(card, null, reload)); });
    item.appendChild(add);
    return item;
  }

  function commissionItem(card) {
    var item = U.node('div', 'rp-item');
    item.appendChild(U.node('h4', null, 'Commissioning and F-gas'));
    var f = U.node('form', 'ac-form');
    var fields = [['commissionedOn', 'Commissioned on', 'date', card.commissionedOn], ['engineer', 'Engineer', 'text', card.engineer],
      ['fgasRef', 'F-gas certificate or record ref', 'text', card.fgasRef], ['leakCheckOn', 'Leak check', 'date', card.leakCheckOn],
      ['pressureTest', 'Pressure test (e.g. 38 bar held 30 min)', 'text', card.pressureTest]];
    var inputs = {};
    fields.forEach(function (d) { var x = input(d[1], d[2], d[3], { wide: d[0] === 'pressureTest' }); inputs[d[0]] = x.input; f.appendChild(x.label); });
    var bar = U.node('div', 'rp-row ac-wide');
    var ok = U.node('button', 'btn btn--primary btn--sm', 'Save commissioning');
    ok.type = 'submit';
    bar.appendChild(ok);
    var photos = U.node('button', 'btn btn--ghost btn--sm', 'Photos');
    photos.type = 'button';
    photos.addEventListener('click', function () { var t = document.getElementById('h-photos'); if (t) t.scrollIntoView({ block: 'start' }); });
    bar.appendChild(photos);
    f.appendChild(bar);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var b = { op: 'commission', id: card.id };
      Object.keys(inputs).forEach(function (k) { b[k] = inputs[k].value; });
      send(b, 'Commissioning saved.');
    });
    item.appendChild(f);
    if (['installed', 'commissioned', 'paid'].indexOf(card.stage) === -1) item.appendChild(U.node('p', 'panel-note', 'Mark it installed first.'));
    return item;
  }

  function planItem(card, plan) {
    var item = U.node('div', 'rp-item');
    item.appendChild(U.node('h4', null, 'Service plan'));
    if (plan && plan.status === 'active') {
      item.appendChild(U.node('p', null, 'Every ' + plan.intervalMonths + ' months' + (plan.pricePence != null ? ', ' + U.money(plan.pricePence) + ' a service' : '') + '. Next due ' + plan.nextDueOn +
        (plan.bookedOn ? ', booked ' + plan.bookedOn : '') + '. Change it in Service contract below.'));
      return item;
    }
    if (['installed', 'commissioned', 'paid'].indexOf(card.stage) === -1) { item.appendChild(U.node('p', 'panel-note', 'Offer a plan once the kit is fitted.')); return item; }
    var row = U.node('div', 'rp-row');
    var every = document.createElement('select');
    every.setAttribute('aria-label', 'How often');
    [['12', 'Every year'], ['6', 'Every 6 months'], ['24', 'Every 2 years']].forEach(function (o) { every.appendChild(new Option(o[1], o[0])); });
    var price = document.createElement('input'); price.type = 'text'; price.inputMode = 'decimal'; price.className = 'rp-cost'; price.placeholder = '£ a service'; price.setAttribute('aria-label', 'Price per service in pounds');
    row.appendChild(every); row.appendChild(price);
    row.appendChild(btn('Add service plan', 'btn--primary', function () {
      send({ op: 'plan', id: card.id, intervalMonths: Number(every.value), pricePence: price.value.trim() ? U.toPence(price.value) : null }, 'Service plan added.');
    }));
    item.appendChild(row);
    return item;
  }

  function draw(data) {
    body.textContent = '';
    body.appendChild(stageItem(data.card));
    var list = U.node('div', 'rp-list');
    if (['accepted', 'quoted', 'survey'].indexOf(data.card.stage) !== -1) list.appendChild(kitItem(data.card));
    list.appendChild(unitsItem(data.card, data.units));
    list.appendChild(commissionItem(data.card));
    list.appendChild(planItem(data.card, data.plan));
    body.appendChild(list);
  }

  async function load(id, force) {
    if (!force && current === id) return;
    current = id;
    try {
      var data = await U.get('/api/admin/coolright?view=job&id=' + id);
      if (current === id) draw(data);
    } catch (e) { fail('The CoolRight details could not be loaded.'); }
  }

  function fill(j) {
    block.hidden = j.site !== 'ac' || ['declined', 'cancelled', 'refunded'].indexOf(j.status) !== -1;
    if (block.hidden) return;
    var moved = lastStatus !== null && lastStatus !== j.status && current === j.id;
    lastStatus = j.status;
    load(j.id, moved);
  }

  document.getElementById('job-dialog').addEventListener('close', function () { current = null; lastStatus = null; body.textContent = ''; });
  global.DSQAC = { fill: fill };
})(window);
