/* After an enquiry is sent (the form itself is already saved, so leaving at
   any point here loses nothing and makes no second enquiry): first a day and
   a time, then which survey. Days and times come from lib/web-booking.js; a
   tap asks for that time, held for the team to confirm, so the words say
   "requested", never "booked". Then "What do you need?" with prices from the
   one price list (content/prices.js, sent with the times) and a small (i) by
   each with what it is. Nothing shows when the owners have not switched it
   on. Loaded by book.js. */
(function () {
  'use strict';
  var nice = function (d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }); };
  var short = function (d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); };
  var clock = function (t) { var h = Number(t.slice(0, 2)); return (h % 12 || 12) + (t.slice(3) === '00' ? '' : ':' + t.slice(3)) + (h < 12 ? 'am' : 'pm'); };
  var money = function (n, from) { return (from ? 'from ' : '') + '£' + n; };
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; }
  async function post(body) {
    var r = await fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    var d = await r.json().catch(function () { return {}; });
    return { status: r.status, data: d };
  }
  function done(box, title, words) { box.textContent = ''; box.appendChild(el('h4', 'bt-title', title)); if (words) box.appendChild(el('p', 'note', words)); }

  async function start(box, lead, note) {
    var r = await post({ op: 'times', leadId: lead.id, sessionId: lead.sessionId });
    var d = r.data || {};
    box.textContent = '';
    var next = d.askSurvey ? function (said) { survey(box, lead, d.prices, said); } : function (said) { done(box, 'Thanks', said); };
    if (!(d.days || []).length) { if (d.askSurvey) { box.hidden = false; return next(''); } box.hidden = true; return; }
    box.hidden = false;
    times(box, lead, d.days, note, next);
  }

  /* Step one: the days with a free time, then every free time on the day tapped. */
  function times(box, lead, days, note, next) {
    box.appendChild(el('h4', 'bt-title', 'Want to pick a survey time now?'));
    box.appendChild(el('p', 'note', note || 'Pick a day, then a time that suits you. We will confirm it with you shortly.'));
    var dayRow = el('div', 'bt-row bt-days'), timeBox = el('div', 'bt-times');
    days.forEach(function (d) {
      var b = el('button', 'bt-time bt-dayb', short(d.date)); b.type = 'button'; b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () {
        dayRow.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        timeBox.textContent = '';
        timeBox.appendChild(el('p', 'bt-day', nice(d.date) + ': pick a time'));
        var row = el('div', 'bt-row');
        d.times.forEach(function (t) {
          var tb = el('button', 'bt-time', clock(t.time)); tb.type = 'button';
          tb.addEventListener('click', async function () {
            tb.disabled = true;
            var p = await post({ op: 'pick', leadId: lead.id, sessionId: lead.sessionId, date: t.date, time: t.time, ticket: t.ticket });
            if (p.data && p.data.ok) next(nice(t.date) + ' at ' + clock(t.time) + ' is requested. We will be in touch shortly to confirm it.');
            else start(box, lead, 'Sorry, that time has just gone. Here are the times still free.');
          });
          row.appendChild(tb);
        });
        timeBox.appendChild(row);
      });
      dayRow.appendChild(b);
    });
    box.appendChild(dayRow); box.appendChild(timeBox);
    var no = el('button', 'bt-skip', 'No thanks, call me to arrange a time'); no.type = 'button';
    no.addEventListener('click', function () { next('No problem, we will call you to arrange a time.'); });
    box.appendChild(no);
  }

  /* A tap target with a small (i) that opens a line saying what it is. */
  function choice(label, price, info, onPick, cls) {
    var wrap = el('div', 'bt-pick');
    var b = el('button', 'bt-survey ' + (cls || '')); b.type = 'button'; b.setAttribute('aria-pressed', 'false');
    b.appendChild(el('b', null, label)); if (price) b.appendChild(el('span', 'bt-price', price));
    b.addEventListener('click', function () { onPick(b); });
    wrap.appendChild(b);
    if (info) {
      var i = el('button', 'bt-info', 'i'); i.type = 'button'; i.setAttribute('aria-label', 'What is ' + label + '?'); i.setAttribute('aria-expanded', 'false');
      var p = el('p', 'bt-infotext', info); p.hidden = true;
      i.addEventListener('click', function () { p.hidden = !p.hidden; i.setAttribute('aria-expanded', String(!p.hidden)); });
      wrap.appendChild(i); wrap.appendChild(p);
    }
    return wrap;
  }
  function only(list, b) { list.querySelectorAll('.bt-survey').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); }

  /* Step two: what they need, then the size, then anything to add. */
  function survey(box, lead, P, said) {
    box.textContent = '';
    if (said) box.appendChild(el('p', 'bt-said', said));
    box.appendChild(el('h4', 'bt-title', 'What do you need?'));
    box.appendChild(el('p', 'note', 'So we come with the right time and price. You can change it when we call.'));
    var pick = { service: null, size: null, extras: [] };
    var list = el('div', 'bt-surveys'), rest = el('div');
    [['damp', P.services.damp.name, P.services.damp.info], ['timber', P.services.timber.name, P.services.timber.info],
      ['alone', 'Just a timber, camera or cavity check', 'One of our checks on its own, without a damp survey.'],
      ['unsure', 'Not sure, help me choose', 'Tell us on the phone what you are seeing and we will recommend the right one.']].forEach(function (s) {
      list.appendChild(choice(s[1], null, s[2], function (b) { only(list, b); pick = { service: s[0], size: null, extras: [] }; draw(); }));
    });
    box.appendChild(list); box.appendChild(rest);
    function draw() {
      rest.textContent = '';
      if (pick.service === 'unsure') return send();
      if (pick.service === 'alone') {
        rest.appendChild(el('p', 'bt-day', 'Which one? Pick any'));
        P.extras.forEach(function (x) { rest.appendChild(tick(x.name, money(x.alone, x.from), x.scope + '. ' + x.info, x.key)); });
      } else {
        rest.appendChild(el('p', 'bt-day', 'How much of the home?'));
        var sizes = el('div', 'bt-surveys');
        P.sizes.forEach(function (z) {
          var price = z.damp + (pick.service === 'timber' ? z.timber : 0);
          sizes.appendChild(choice(z.name + ': ' + z.scope, money(price, z.from), z.info, function (b) { only(sizes, b); pick.size = z.key; go.disabled = false; }));
        });
        rest.appendChild(sizes);
        rest.appendChild(el('p', 'bt-day', 'Add on the same visit (optional)'));
        P.extras.filter(function (x) { return x.addable; }).forEach(function (x) { rest.appendChild(tick(x.name, money(x.withSurvey, x.from), x.scope + '. ' + x.info, x.key)); });
      }
      var go = el('button', 'bt-time bt-go', 'Done'); go.type = 'button'; go.disabled = pick.service !== 'alone' || !pick.extras.length;
      go.addEventListener('click', send);
      rest.appendChild(go);
      rest.go = go;
    }
    function tick(name, price, info, key) {
      var row = el('div', 'bt-pick');
      var l = el('label', 'bt-add'), c = document.createElement('input'); c.type = 'checkbox';
      c.addEventListener('change', function () {
        pick.extras = pick.extras.filter(function (k) { return k !== key; }); if (c.checked) pick.extras.push(key);
        if (pick.service === 'alone' && rest.go) rest.go.disabled = !pick.extras.length;
      });
      l.appendChild(c); l.appendChild(document.createTextNode(' ' + name + ', ' + price)); row.appendChild(l);
      var i = el('button', 'bt-info', 'i'); i.type = 'button'; i.setAttribute('aria-label', 'What is ' + name + '?');
      var p = el('p', 'bt-infotext', info); p.hidden = true;
      i.addEventListener('click', function () { p.hidden = !p.hidden; });
      row.appendChild(i); row.appendChild(p);
      return row;
    }
    async function send() {
      var r = await post({ op: 'survey', leadId: lead.id, sessionId: lead.sessionId, choice: pick });
      var c = r.data && r.data.chose;
      done(box, 'Thanks, all noted', (said ? said + ' ' : '') + (pick.service !== 'unsure' && c && c.price
        ? c.name + ', ' + money(c.price, c.from) + ((c.addOns || []).length ? ', with ' + c.addOns.map(function (a) { return a.name.toLowerCase() + ' ' + money(a.price, a.from); }).join(' and ') : '') + '. We confirm the fee before we come.'
        : 'We will help you choose the right survey when we call.'));
    }
  }

  window.addEventListener('lead:sent', function (e) {
    var success = document.querySelector('.book-success');
    if (!success || !e.detail || !e.detail.id) return;
    var box = el('div', 'bt'); box.hidden = true;
    success.appendChild(box);
    start(box, e.detail);
  });
})();
