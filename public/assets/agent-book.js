/* Quick book on the estate agent's page: one small question per screen in a
   sheet from the bottom. The property, the buyer, why and who lets us in,
   then the survey size and a time, through the website's own booking steps
   (/api/lead op survey, times, pick), so a time tapped books it as online. */
(function (global) {
  'use strict';
  var P = global.PT, h = P.h, t = P.t, btn = P.btn, money = P.money;
  var scrim, sheet, body, form, booked;

  function field(name, label, opts) {
    opts = opts || {};
    var w = h('div', 'ag-q'), l = t('label', 'pt-label', label), f = h('div', 'pt-field'), i = t('input');
    i.name = name; i.id = 'ag-' + name; l.htmlFor = i.id; i.type = opts.type || 'text'; i.value = form[name] || '';
    if (opts.mode) i.inputMode = opts.mode; if (opts.auto) i.autocomplete = opts.auto; if (opts.ph) i.placeholder = opts.ph;
    /* Phone boxes take only digits, spaces and a leading +. */
    if (opts.type === 'tel') i.addEventListener('input', function () { var v = i.value.replace(/[^\d\s+]/g, ''); i.value = v.charAt(0) + v.slice(1).replace(/\+/g, ''); });
    i.addEventListener('input', function () { form[name] = i.value; f.classList.remove('bad'); });
    f.appendChild(i); w.appendChild(l); w.appendChild(f); return w;
  }
  function choice(name, label, items) {
    var w = h('div', 'ag-q'); w.appendChild(t('span', 'pt-label', label));
    var c = h('div', 'ag-choices'); c.setAttribute('role', 'group'); c.setAttribute('aria-label', label);
    items.forEach(function (it) {
      var b = btn('pt-chip', null, function () { form[name] = it[0]; c.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); if (name === 'access') step(); });
      b.textContent = it[1]; b.setAttribute('aria-pressed', String(form[name] === it[0])); c.appendChild(b);
    });
    w.appendChild(c); return w;
  }
  function next(label, fn) { var b = btn('pt-btn', '<span class="in"></span>', fn); b.firstChild.textContent = label; return b; }
  function shake(names) { names.forEach(function (n) { var i = body.querySelector('[name="' + n + '"]'); if (i) i.parentNode.classList.add('bad'); }); }

  var STEPS = [
    function () {
      head('The property');
      body.appendChild(field('address', 'First line of the address', { auto: 'address-line1' }));
      body.appendChild(field('town', 'Town', { auto: 'address-level2' }));
      body.appendChild(field('postcode', 'Postcode', { auto: 'postal-code' }));
      body.appendChild(next('Next', function () { var bad = ['address', 'postcode'].filter(function (n) { return !String(form[n] || '').trim(); }); if (bad.length) return shake(bad); go(1); }));
    },
    function () {
      head('The buyer');
      body.appendChild(field('name', 'Their name', { auto: 'off' }));
      body.appendChild(field('phone', 'Their mobile', { type: 'tel', mode: 'tel', auto: 'off' }));
      body.appendChild(field('email', 'Their email', { type: 'email', mode: 'email', auto: 'off' }));
      body.appendChild(next('Next', function () {
        var bad = [];
        if (!String(form.name || '').trim()) bad.push('name');
        var d = String(form.phone || '').replace(/\s/g, '').replace(/^\+44/, '0');
        if (!/^0\d{10}$/.test(d)) bad.push('phone');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(form.email || '').trim())) bad.push('email');
        if (bad.length) return shake(bad); go(2);
      }));
    },
    function () {
      head('Why and access');
      body.appendChild(choice('reason', 'Why the survey', [['valuer', 'Valuer flagged damp'], ['buyer', 'Buyer is worried'], ['vendor', 'Before selling'], ['other', 'Something else']]));
      body.appendChild(choice('access', 'Who lets us in?', [['agent', 'We have the keys'], ['vendor', 'The vendor'], ['tenant', 'The tenant']]));
      if (form.access && form.access !== 'agent') body.appendChild(field('contact', 'Their name and number'));
      body.appendChild(field('note', 'Anything we should know (optional)'));
      body.appendChild(next('Next', function () { if (!form.reason) form.reason = 'other'; if (!form.access) form.access = 'agent'; send(); }));
    }
  ];

  function head(title) {
    body.textContent = '';
    var hd = h('div', 'pt-sheet-head'); hd.appendChild(t('h2', null, title));
    var x = btn('pt-sheet-x', '&times;', close); x.setAttribute('aria-label', 'Close'); hd.appendChild(x); body.appendChild(hd);
  }
  var at = 0;
  function go(n) { at = n; STEPS[n](); var f = body.querySelector('input'); if (f && !global.matchMedia('(hover: none)').matches) f.focus(); }
  function step() { STEPS[at](); }

  /* The enquiry is made now, so leaving at the time step still leaves it with us. */
  function send() {
    var b = body.querySelector('.pt-btn'); b.classList.add('busy'); b.disabled = true;
    var x = {}; Object.keys(form).forEach(function (k) { x[k] = form[k]; }); x.op = 'book';
    global.AGENT.post(x).then(function (r) {
      if (!r.ok) { b.classList.remove('busy'); b.disabled = false; if (r.errors) { var k = Object.keys(r.errors)[0]; P.toast(r.errors[k]); go(['address', 'postcode', 'town'].indexOf(k) !== -1 ? 0 : ['name', 'phone', 'email'].indexOf(k) !== -1 ? 1 : 2); shake([k]); } else P.toast('That didn\'t go through. Try again.'); return; }
      /* Already booked at this property: said, never a second survey. */
      if (r.already) return already(r.already);
      booked = { leadId: r.leadId, sessionId: r.sessionId, texts: r.texts !== false }; if (r.name) form.name = r.name; global.AGENT.reload(); size();
    });
  }
  function lead(op, extra) {
    var b = { op: op, leadId: booked.leadId, sessionId: booked.sessionId };
    Object.keys(extra || {}).forEach(function (k) { b[k] = extra[k]; });
    return fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(function (r) { return r.json().catch(function () { return {}; }); });
  }
  /* The size of the home sets the time on site, so the times offered fit it. */
  function size() {
    head('The survey');
    lead('prices').then(function (r) {
      var sizes = (r.prices && r.prices.sizes) || [], timber = false, w = h('div', 'ag-sizes');
      var tb = btn('pt-chip', 'Add timber', function () { timber = !timber; tb.setAttribute('aria-pressed', String(timber)); });
      tb.setAttribute('aria-pressed', 'false');
      sizes.forEach(function (s) {
        var c = btn('ag-size', null, function () {
          c.classList.add('busy');
          lead('survey', { choice: { service: timber ? 'timber' : 'damp', size: s.key } }).then(function (x) { if (x.ok) times(); else { c.classList.remove('busy'); P.toast('That didn\'t go through. Try again.'); } });
        });
        c.appendChild(t('b', null, s.name)); c.appendChild(t('small', null, s.scope)); c.appendChild(t('span', null, (s.from ? 'From ' : '') + money(s.damp * 100)));
        w.appendChild(c);
      });
      body.appendChild(w); body.appendChild(tb);
      body.appendChild(btn('pt-btn ghost', 'Not sure: call the buyer', leave));
    });
  }
  function times() {
    head('When suits?');
    var area = h('div', 'pt-movearea'); area.appendChild(t('p', null, 'Finding times...')); body.appendChild(area);
    lead('times', { days: 56 }).then(function (r) {
      area.textContent = '';
      var list = (r.days || []).filter(function (d) { return d.times && d.times.length; });
      if (!list.length) { area.appendChild(t('p', null, 'No free times near there yet.')); area.appendChild(btn('pt-btn', 'Leave it with us', leave)); return; }
      var days = h('div', 'pt-days'), slots = h('div', 'pt-times');
      function show(d) {
        slots.textContent = '';
        d.times.forEach(function (x) {
          var b = btn(null, null, function () {
            b.setAttribute('aria-pressed', 'true'); b.disabled = true;
            lead('pick', { date: x.date, time: x.time, ticket: x.ticket }).then(function (p) {
              if (p.ok) done(p.booked ? { when: global.AGENT.day(x.date) + ' at ' + x.time } : { asked: global.AGENT.day(x.date) + ' at ' + x.time });
              else { P.toast('That time has just gone. Pick another.'); times(); }
            });
          });
          b.textContent = x.time; slots.appendChild(b);
        });
      }
      list.forEach(function (d, i) {
        var b = btn(null, null, function () { days.querySelectorAll('button').forEach(function (y) { y.setAttribute('aria-pressed', String(y === b)); }); show(d); });
        var dt = new Date(d.date + 'T12:00:00Z');
        b.appendChild(t('small', null, dt.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }))); b.appendChild(t('b', null, String(dt.getUTCDate())));
        b.setAttribute('aria-pressed', String(i === 0)); days.appendChild(b);
      });
      area.appendChild(days); area.appendChild(slots); show(list[0]);
      area.appendChild(btn('pt-btn ghost', 'Leave it with us to arrange', leave));
    });
  }
  /* Left with us: the team is told at once (lib/form-outcome.js), not ten minutes later. */
  function leave() { lead('outcome', { what: 'call' }).catch(function () {}); done(null); }
  function already(x) {
    head('Already booked');
    body.appendChild(t('p', 'ag-done', String(form.name || 'They').trim() + ' is already booked here' + (x.said ? ' for ' + x.said : '') + '. It\'s on your page, with their visit and progress.'));
    body.appendChild(btn('pt-btn', 'Done', close));
  }
  function done(r) {
    var who = String(form.name || 'The buyer').trim().split(/\s+/)[0];
    /* No mobile of their own (a landline, or the agency's number): no text, so it says so. */
    var texted = !booked || booked.texts;
    head(r && r.when ? 'Booked' : 'With us');
    body.appendChild(t('p', 'ag-done', r && r.when ? r.when + '. ' + (texted ? who + ' gets a text with their page and the deposit link.' : 'We\'ll email or call ' + who + ' with their page and the deposit link.')
      : r && r.asked ? r.asked + ' asked for. We\'ll confirm it and ' + (texted ? who + ' gets a text.' : 'let ' + who + ' know.') : 'We\'ll call ' + who + ' to arrange a time. It shows here once booked.'));
    body.appendChild(btn('pt-btn', 'Done', close));
    global.AGENT.reload();
  }

  /* prefill: the property, from "Book another visit here" on a survey already done. */
  function open(prefill) {
    form = {}; booked = null;
    Object.keys(prefill || {}).forEach(function (k) { form[k] = prefill[k]; });
    if (!sheet) {
      scrim = h('div', 'pt-scrim'); scrim.addEventListener('click', close);
      sheet = h('div', 'pt-sheet ag-sheet'); sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-label', 'Quick book');
      sheet.appendChild(h('div', 'pt-grab')); body = h('div', 'ag-body'); sheet.appendChild(body);
      document.body.appendChild(scrim); document.body.appendChild(sheet);
    }
    go(0);
    requestAnimationFrame(function () { scrim.classList.add('open'); sheet.classList.add('open'); });
  }
  function close() { if (!sheet) return; scrim.classList.remove('open'); sheet.classList.remove('open'); }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  global.AGENTBOOK = { open: open };
})(window);
