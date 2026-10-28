/* CoolRight's service round: every plan due this month and next (and any
   overdue), grouped by postcode district. Tick the ones that make a day,
   book them for that day in one go (they then sit on Today's calendar), and
   send each customer the booking message from your own phone. Serviced uses
   the contracts route's own op, which records the day and rolls the next due
   date on. Below, on demand (and open from March to May), the "Before
   summer" list of past customers to ask. */
(function (global) {
  'use strict';

  var U = global.DSUI;
  var A = global.DSAC;
  var R = global.DSROOF;
  var M = global.DSMSG;
  var state = { data: null, q: '', picked: {}, summer: null };
  var el = function (id) { return document.getElementById(id); };

  function link(text, href) { var a = U.node('a', 'pill act', text); a.href = href; if (/^https:/.test(href)) { a.target = '_blank'; a.rel = 'noopener'; } return a; }
  function btn(text, fn, cls) { var b = U.node('button', 'pill act ' + (cls || ''), text); b.type = 'button'; b.addEventListener('click', fn); return b; }
  async function act(fn) { try { await fn(); } catch (e) { global.alert(e.message); } load(); }

  /* A plan typed in by hand has no job, so its message is sent from plain links and the reminder recorded on the plan. */
  function messageRow(s) {
    if (!s.message) return U.node('span', 'who', 'No message yet.');
    if (s.jobId && M) return M.buttons(s.jobId, s.message, function () { load(); });
    var row = U.node('div', 'sv-row');
    [['whatsapp', 'WhatsApp'], ['sms', 'Text'], ['email', 'Email']].forEach(function (c) {
      var href = s.message.links[c[0]];
      if (!href) return;
      var a = link(c[1], href);
      a.addEventListener('click', function () { U.send('/api/admin/contracts', { op: 'contacted', id: s.id }); });
      row.appendChild(a);
    });
    if (!row.children.length) row.appendChild(U.node('span', 'who', 'No mobile or email on this plan.'));
    return row;
  }

  function item(s) {
    var box = U.node('div', 'sv-item' + (state.picked[s.id] ? ' is-picked' : ''));
    var pick = U.node('label', 'sv-pick');
    var box2 = document.createElement('input');
    box2.type = 'checkbox';
    box2.checked = Boolean(state.picked[s.id]);
    box2.addEventListener('change', function () { if (box2.checked) state.picked[s.id] = s; else delete state.picked[s.id]; box.classList.toggle('is-picked', box2.checked); roundBar(); });
    pick.appendChild(box2);
    var when = s.daysUntilDue < 0 ? (-s.daysUntilDue) + ' days overdue' : 'due ' + R.shortDate(s.nextDueOn);
    pick.appendChild(U.node('span', null, [s.name || 'No name', s.postcode].filter(Boolean).join(', ') + ' · ' + when));
    box.appendChild(pick);
    var meta = [s.unitCount + (s.unitCount === 1 ? ' unit' : ' units'), 'every ' + s.intervalMonths + ' months'];
    if (s.pricePence != null) meta.push(U.money(s.pricePence));
    if (s.bookedOn) meta.push('Booked ' + R.shortDate(s.bookedOn) + (s.bookedTime ? ' ' + s.bookedTime : ''));
    if (s.lastContactedOn) meta.push('reminded ' + s.lastContactedOn);
    if (s.lastServicedOn) meta.push('last serviced ' + s.lastServicedOn);
    box.appendChild(U.node('p', 'card-meta', meta.join(' · ')));
    box.appendChild(messageRow(s));
    var row = U.node('div', 'sv-row');
    if (s.phone) row.appendChild(link('Call', 'tel:' + String(s.phone).replace(/[^\d+]/g, '')));
    row.appendChild(btn(s.bookedOn ? 'Move visit' : 'Set date', function () {
      R.askDate('Service visit for ' + (s.firstName || 'this customer'), s.bookedOn || '', true).then(function (got) {
        if (got) act(function () { return A.write({ op: 'book', contractId: s.id, date: got.date, time: got.time }, 'Booked for ' + R.shortDate(got.date) + '.', load); });
      });
    }, 'act-main'));
    row.appendChild(btn('Serviced', function () {
      if (!global.confirm('Record a service today and move the next one on by ' + s.intervalMonths + ' months?')) return;
      act(async function () { var r = await U.send('/api/admin/contracts', { op: 'serviced', id: s.id }); if (!r.ok) throw new Error('Could not record the service.'); });
    }));
    if (s.jobId) row.appendChild(link('Open', A.jobHref(s.jobId)));
    box.appendChild(row);
    return box;
  }

  function roundBar() {
    var n = Object.keys(state.picked).length;
    el('round').hidden = !n;
    el('round-count').textContent = n + ' ticked';
  }

  function draw() {
    var mount = el('districts');
    mount.textContent = '';
    var q = state.q;
    var any = false;
    state.data.districts.forEach(function (d) {
      var list = d.services.filter(function (s) { return !q || [s.name, s.postcode, s.district].join(' ').toLowerCase().indexOf(q) !== -1; });
      if (!list.length) return;
      any = true;
      var sec = U.node('section', 'sv-district');
      sec.appendChild(U.node('h2', null, d.district + ' (' + list.length + ')'));
      list.forEach(function (s) { sec.appendChild(item(s)); });
      mount.appendChild(sec);
    });
    if (!any) mount.appendChild(U.node('p', 'panel-note', q ? 'Nothing matches.' : 'No services due this month or next.'));
    roundBar();
  }

  async function bookRound() {
    var date = el('round-date').value;
    if (!date) { el('round-date').focus(); return; }
    var ids = Object.keys(state.picked);
    var undos = [];
    for (var i = 0; i < ids.length; i++) {
      var r = await U.send('/api/admin/coolright', { op: 'book', contractId: Number(ids[i]), date: date });
      if (r.ok && r.data.undo) undos.push(r.data.undo);
    }
    state.picked = {};
    A.offerUndo(undos.length + ' booked for ' + R.shortDate(date) + '.', null);
    /* Undo for a whole round puts every visit back as it was. */
    var toast = document.querySelector('.undo-toast');
    if (toast && undos.length) {
      var b = U.node('button', null, 'Undo');
      b.type = 'button';
      b.addEventListener('click', async function () { toast.remove(); for (var j = 0; j < undos.length; j++) await U.send('/api/admin/coolright', undos[j]); load(); });
      toast.appendChild(b);
    }
    load();
  }

  function summerItem(c) {
    var box = U.node('div', 'sv-item');
    box.appendChild(U.node('strong', null, [c.name || 'No name', c.postcode].filter(Boolean).join(', ')));
    box.appendChild(U.node('p', 'card-meta', (c.onPlan ? 'On a plan, due ' + c.nextDueOn : 'No service plan') + (c.jobDate ? ' · fitted ' + c.jobDate : '') +
      (c.askedOn ? ' · last asked ' + c.askedOn : '')));
    if (c.message && M) box.appendChild(M.buttons(c.jobId, c.message, function () { loadSummer(); }));
    var row = U.node('div', 'sv-row');
    if (c.phone) row.appendChild(link('Call', 'tel:' + String(c.phone).replace(/[^\d+]/g, '')));
    row.appendChild(btn(c.askedThisYear ? 'Sent ✓ (untick)' : 'Mark sent', function () {
      A.write({ op: 'summer', id: c.jobId, on: !c.askedThisYear }, c.askedThisYear ? 'Unticked.' : 'Marked sent.', loadSummer).then(loadSummer, function (e) { global.alert(e.message); });
    }, c.askedThisYear ? '' : 'act-main'));
    row.appendChild(link('Open', A.jobHref(c.jobId)));
    box.appendChild(row);
    return box;
  }

  async function loadSummer() {
    var mount = el('summer-list');
    try { state.summer = await U.get('/api/admin/coolright?view=summer'); } catch (e) { mount.textContent = 'Could not load the list.'; return; }
    mount.textContent = '';
    var left = state.summer.customers.filter(function (c) { return !c.askedThisYear; }).length;
    mount.appendChild(U.node('p', 'card-meta', left + ' to ask, ' + (state.summer.customers.length - left) + ' asked this year.'));
    state.summer.customers.forEach(function (c) { mount.appendChild(summerItem(c)); });
    if (!state.summer.customers.length) mount.appendChild(U.node('p', 'panel-note', 'Nobody to ask.'));
    return state.summer;
  }

  function toggleSummer(open) {
    el('summer').hidden = !open;
    el('summer-toggle').setAttribute('aria-expanded', String(open));
    if (open) loadSummer();
  }

  async function load() {
    try {
      state.data = await U.get('/api/admin/coolright?view=services');
      el('state').hidden = true;
      el('content').hidden = false;
      draw();
    } catch (e) { el('state').textContent = 'Could not load the services. ' + e.message; el('state').hidden = false; }
  }

  el('sv-q').addEventListener('input', function () { state.q = this.value.trim().toLowerCase(); if (state.data) draw(); });
  el('round-book').addEventListener('click', bookRound);
  el('round-clear').addEventListener('click', function () { state.picked = {}; draw(); });
  el('summer-toggle').addEventListener('click', function () { toggleSummer(el('summer').hidden); });
  var refresh = el('refresh');
  if (refresh) refresh.addEventListener('click', load);
  var out = el('logout');
  if (out) out.addEventListener('click', async function () { await fetch('/api/auth/logout', { method: 'POST' }); location.replace('/staff'); });
  /* March to May the list is open from the start: that is when it is worth a push. */
  var month = Number(R.londonToday().slice(5, 7));
  if (month >= 3 && month <= 5) toggleSummer(true);
  load();
})(window);
