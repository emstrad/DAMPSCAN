/* The estate agent's page (/a/<token>): every property they sent us or let us
   into, urgent first. Reads /api/quote?doc=agent; the brand's name, mark and
   palette come from the server, so this shared file names neither brand.
   Quick book is public/assets/agent-book.js. */
(function () {
  'use strict';
  var P = window.PT, I = P.I, h = P.h, t = P.t, btn = P.btn, money = P.money;
  var token = (/^\/a\/([A-Za-z0-9_-]+)$/.exec(location.pathname) || [])[1] || new URLSearchParams(location.search).get('t') || '';
  var api = '/api/quote?doc=agent&t=' + encodeURIComponent(token);
  var main = document.getElementById('main');
  var day = function (d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); };
  var TONE = { confirm: 'warn', ready: 'warn', done: 'good', visited: '', booked: 'good', requested: '', arranging: '', cancelled: '' };
  var data;

  function post(body) {
    body.doc = 'agent'; body.t = token;
    return fetch('/api/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }); });
  }
  window.AGENT = { post: post, token: token, reload: load, day: day };

  function brandBar(brand) {
    var top = h('div', 'pt-top'), logo = h('a', 'pt-logo'); logo.href = brand.origin; logo.setAttribute('aria-label', brand.name + ' home');
    var mk = brand.mark || {};
    if (mk.img) { var im = t('img'); im.src = mk.img; im.alt = mk.alt || brand.name; logo.appendChild(im); logo.appendChild(t('span', 'tag', mk.tag)); }
    else { var w = h('span', 'pt-word'), b = t('b', null, (mk.word || [brand.name])[0]); if (mk.word && mk.word[1]) b.appendChild(t('span', null, mk.word[1])); w.appendChild(b); if (mk.tag) w.appendChild(t('small', null, mk.tag)); logo.appendChild(w); }
    top.appendChild(logo); top.appendChild(h('span', 'pt-private', I.lock + '<span>Private to you</span>'));
    var head = document.getElementById('head'); head.textContent = ''; head.appendChild(top);
  }

  function chip(label, href, icon) { var a = h('a', 'pt-chip', icon || ''); a.appendChild(document.createTextNode(label)); a.href = href; return a; }
  function line(label, value) { var r = h('div', 'ag-line'); r.appendChild(t('small', null, label)); r.appendChild(t('b', null, value)); return r; }
  /* Nothing in yet reads as the deposit to come; the deposit in reads as the balance to come (the owner, 27 Nov 2026). */
  function moneyLine(m) {
    if (!m.due) return 'Paid in full';
    if (!m.paid) return 'Deposit ' + money(m.deposit) + ' due, ' + money(m.price) + ' in total';
    if (m.depositPaid && m.paid < m.price) return 'Deposit paid, balance ' + money(m.due) + ' due';
    return money(m.paid) + ' paid, ' + money(m.due) + ' to pay';
  }
  function when(s) { return s.date ? day(s.date) + (s.time ? ' at ' + s.time : '') : null; }

  function card(s) {
    var c = h('article', 'pt-card ag-card'); c.id = s.kind + '-' + s.id;
    var top = h('div', 'ag-top'), where = h('div', 'ag-where');
    where.appendChild(t('h2', null, s.address || s.postcode || 'Address to follow'));
    where.appendChild(t('small', null, [s.address && s.postcode && s.address.indexOf(s.postcode) === -1 ? s.postcode : null, s.access].filter(Boolean).join(' · ')));
    top.appendChild(where);
    var b = h('span', 'pt-badge ' + (TONE[s.stage.key] || '')); b.appendChild(t('span', null, s.stage.label)); top.appendChild(b);
    c.appendChild(top);
    var rows = h('div', 'ag-lines');
    rows.appendChild(line(s.role || 'Buyer', s.name || 'Not given'));
    if (when(s)) rows.appendChild(line(s.stage.key === 'requested' ? 'Time asked for' : 'Visit', when(s) + (s.surveyor ? ' with ' + s.surveyor : '')));
    if (s.survey && s.kind === 'job') rows.appendChild(line('Survey', s.survey));
    if (s.money) rows.appendChild(line('Money', moneyLine(s.money)));
    if (s.reportDue) rows.appendChild(line('Report due', new Date(s.reportDue).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Europe/London' })));
    if (s.onWay) rows.appendChild(line('Today', s.surveyor ? s.surveyor + ' is on the way' : 'On the way'));
    c.appendChild(rows);
    var chips = h('div', 'pt-chips');
    if (s.phone) chips.appendChild(chip('Call ' + (s.first || 'buyer'), 'tel:' + s.phone.replace(/[^\d+]/g, ''), I.phone));
    if (s.email) chips.appendChild(chip('Email', 'mailto:' + s.email));
    if (s.page) { var pg = chip('Their page', s.page); pg.target = '_blank'; pg.rel = 'noopener'; chips.appendChild(pg); }
    if (chips.children.length) c.appendChild(chips);
    if (s.report) {
      var dl = h('a', 'pt-btn', '<span class="in">' + I.dl + ' Open the report</span>');
      dl.href = api + '&file=report&job=' + s.id; c.appendChild(dl);
      if (s.report2) { var d2 = h('a', 'pt-btn ghost', '<span class="in">' + I.dl + ' Open the second report</span>'); d2.href = api + '&file=report2&job=' + s.id; c.appendChild(d2); }
    }
    if (s.stage.key === 'confirm') confirmBox(c, s);
    return c;
  }

  /* A time we proposed for access: one tap to confirm, or say what suits instead. */
  function confirmBox(c, s) {
    if (s.asked) { c.appendChild(P.banner('', 'You asked for another time: "' + s.asked.note + '". We\'ll be in touch.')); }
    var yes = btn('pt-btn', '<span class="in">' + I.check + ' Confirm ' + when(s) + '</span>', function () {
      yes.classList.add('busy'); yes.disabled = true;
      post({ op: 'confirm', job: s.id }).then(function (r) {
        if (!r.ok) { yes.classList.remove('busy'); yes.disabled = false; P.toast('That didn\'t go through. Try again.'); return; }
        P.toast('Confirmed. ' + (s.first || 'The buyer') + ' gets a text.'); load();
      });
    });
    c.appendChild(yes);
    var other = btn('pt-btn ghost', 'Another time', function () {
      other.remove();
      var f = h('label', 'pt-field ag-note'), box = t('input'); box.placeholder = 'What suits? e.g. any morning next week'; box.maxLength = 300; f.appendChild(box); c.appendChild(f);
      var send = btn('pt-btn ghost', 'Send', function () {
        if (!box.value.trim()) { f.classList.add('bad'); return; }
        send.classList.add('busy');
        post({ op: 'another', job: s.id, note: box.value }).then(function (r) { if (r.ok) { P.toast('Sent. We\'ll come back to you.'); load(); } else { send.classList.remove('busy'); P.toast('That didn\'t go through. Try again.'); } });
      });
      c.appendChild(send); box.focus();
    });
    c.appendChild(other);
  }

  /* Forgiving: each word typed in the address, postcode, buyer's name or number, spaces ignored. */
  var squash = function (x) { return String(x || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
  function search(all) {
    var f = h('label', 'pt-field ag-search'), box = t('input'); box.type = 'search'; box.placeholder = 'Search address, postcode or buyer'; box.setAttribute('aria-label', 'Search your properties');
    f.appendChild(box); main.appendChild(f);
    var out = h('div', 'ag-sec ag-found'); out.hidden = true; main.appendChild(out);
    box.addEventListener('input', function () {
      var words = box.value.toLowerCase().split(/\s+/).map(squash).filter(Boolean);
      main.classList.toggle('ag-searching', words.length > 0); out.textContent = ''; out.hidden = !words.length;
      if (!words.length) return;
      var hits = all.filter(function (s) { var hay = squash([s.address, s.postcode, s.name, s.phone, s.email].join(' ')); return words.every(function (w) { return hay.indexOf(w) !== -1; }); });
      out.appendChild(t('h2', 'pt-label', hits.length ? hits.length + ' found' : 'Nothing found'));
      hits.forEach(function (x) { out.appendChild(card(x)); });
    });
  }

  function section(title, list) {
    var s = h('section', 'ag-sec'); s.appendChild(t('h2', 'pt-label', title));
    list.forEach(function (x) { s.appendChild(card(x)); }); main.appendChild(s);
  }

  function draw(d) {
    data = d; main.textContent = '';
    document.documentElement.dataset.site = d.code; brandBar(d.brand);
    var hello = h('div', 'pt-hello'); hello.appendChild(t('small', null, d.agent.name + (d.agent.branch ? ', ' + d.agent.branch : '')));
    var h1 = document.getElementById('title') || t('h1', 'pt-title'); h1.id = 'title'; h1.textContent = 'Your properties'; hello.appendChild(h1); main.appendChild(hello);
    var go = btn('pt-btn ag-book', '<span class="in">Quick book a survey</span>', function () { window.AGENTBOOK.open(); });
    main.appendChild(go);
    var all = d.needsYou.concat(d.current, d.finished);
    if (all.length > 3) search(all);
    if (d.needsYou.length) section('Needs you now', d.needsYou);
    if (d.current.length) section('Your properties', d.current);
    if (!d.needsYou.length && !d.current.length) main.appendChild(t('p', 'ag-empty', 'Nothing on yet. Quick book your first one.'));
    if (d.finished.length) P.fold(main, 'Finished (' + d.finished.length + ')', function (inner) { d.finished.forEach(function (x) { inner.appendChild(card(x)); }); });
    var foot = h('p', 'ag-foot'); foot.appendChild(document.createTextNode('Questions? ')); var tel = t('a', null, 'Call ' + d.brand.phoneLabel); tel.href = 'tel:' + d.brand.phone; foot.appendChild(tel); main.appendChild(foot);
  }

  function load(again) {
    return fetch(api + (again === true ? '&again=1' : ''), { cache: 'no-store' }).then(function (r) { return r.json().then(function (j) { return { status: r.status, j: j }; }); })
      .then(function (x) {
        if (!x.j.ok) { main.textContent = ''; main.appendChild(t('h1', 'pt-title', 'This link has expired')); main.appendChild(t('p', null, 'Ask us for a new one.')); return; }
        draw(x.j.page);
      }, function () { P.toast('No connection. Try again.'); });
  }
  /* A link for one property (#job-121, from the assistant) opens on its card, outlined; #book opens Quick book. */
  var focused = false;
  function focus() {
    if (focused) return; focused = true;
    var id = location.hash.slice(1);
    if (id === 'book') { window.AGENTBOOK.open(); return; }
    var el = id && document.getElementById(id);
    if (!el) return;
    el.classList.add('ag-focus'); el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -12);
  }
  load().then(focus);
  /* Fresh on coming back to the tab, never while they are typing. */
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && !document.querySelector('.pt-sheet.open, .ag-note')) load(true); });
})();
