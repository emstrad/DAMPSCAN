/* What a customer can ask from their page (lib/portal-asks.js): On my way
   shown at the top on the day, Ask to move (the surveyors' real free times,
   a request until the team confirms), add photos before the visit, and
   Message us. Nothing here changes the booking. Uses the page's own parts
   (portal-parts.js) so it names neither brand. */
(function (global) {
  'use strict';
  var P = global.PT, h = P.h, t = P.t, btn = P.btn, I = P.I;
  var shortDay = function (d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); };
  var ask = function (token, body) {
    return fetch('/api/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ doc: 'portal', t: token }, body)) })
      .then(function (r) { return r.json().catch(function () { return {}; }); });
  };

  /* On the day, first thing under the greeting: the surveyor's car driving to the house. */
  var CAR = '<svg viewBox="0 0 64 30" width="56" height="26" aria-hidden="true"><path fill="currentColor" d="M6 20c0-3 1.6-4.6 4.6-5.2l6.8-1.4 7.2-6.2C26 6 27.6 5.4 29.4 5.4h12.2c1.8 0 3.4.7 4.6 2l6.2 6.6 4.4.9c2.6.5 4.2 2.4 4.2 5v2.6c0 1.4-1.1 2.5-2.5 2.5H8.5C7.1 25 6 23.9 6 22.5z"/><path fill="var(--card)" opacity=".85" d="M27 8.6c.6-.6 1.4-.9 2.3-.9h5.4v6H22zm10.2-.9h4.4c1 0 1.9.4 2.6 1.1l4.6 4.9h-11.6z"/><circle cx="18" cy="24.5" r="4.6" fill="var(--text)"/><circle cx="18" cy="24.5" r="1.8" fill="var(--card)"/><circle cx="48" cy="24.5" r="4.6" fill="var(--text)"/><circle cx="48" cy="24.5" r="1.8" fill="var(--card)"/></svg>';
  var HOME = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="currentColor" d="M12 3 2.5 11.2l1.3 1.5L5 11.7V20a1 1 0 0 0 1 1h4.5v-6h3v6H18a1 1 0 0 0 1-1v-8.3l1.2 1 1.3-1.5z"/></svg>';
  function top(p, main) {
    if (!p.onWay) return;
    var card = h('div', 'pt-card pt-onway');
    var road = h('div', 'pt-road'); road.setAttribute('role', 'img'); road.setAttribute('aria-label', 'A car driving to your home');
    road.appendChild(h('span', 'pt-home', HOME)); road.appendChild(h('span', 'pt-car', CAR));
    card.appendChild(road);
    var words = h('div', 'pt-onway-words');
    words.appendChild(t('h2', null, (p.onWay.surveyor || 'Your surveyor') + ' is on the way'));
    words.appendChild(t('p', null, 'Heading to you now.'));
    card.appendChild(words);
    main.appendChild(card);
  }

  function moveFold(p, main, token, reload) {
    if (!p.move) return;
    if (p.move.asked) {
      var c = h('div', 'pt-card soft'); c.appendChild(P.banner('', 'You asked to move to', shortDay(p.move.asked.date) + ' at ' + p.move.asked.time + '.'));
      c.appendChild(t('p', null, 'We\'ll call to confirm. Until then your survey stays as it is.')); main.appendChild(c); return;
    }
    if (!p.move.can) return;
    P.fold(main, 'Need a different time?', function (box) {
      var area = h('div'); box.appendChild(area);
      var go = btn('pt-btn ghost', '<span class="in">See other times</span>', function () {
        go.classList.add('busy'); go.disabled = true;
        ask(token, { op: 'times' }).then(function (d) {
          go.remove();
          if (!d.ok || !d.days || !d.days.length) { area.appendChild(t('p', null, 'No other times free just now. Call us and we\'ll help.')); return; }
          var days = h('div', 'pt-chips pt-pick'), times = h('div', 'pt-chips pt-pick'), pick = { date: null, time: null };
          var self = Boolean(p.move.self);
          var send = btn('pt-btn', '<span class="in">' + (self ? 'Move to this time' : 'Ask for this time') + '</span>', function () {
            if (!pick.date || !pick.time) return;
            send.classList.add('busy'); send.disabled = true;
            ask(token, { op: 'move', date: pick.date, time: pick.time }).then(function (r) {
              send.classList.remove('busy'); send.disabled = false;
              if (r.ok) { P.toast(r.moved ? 'Done: moved to ' + shortDay(r.moved.date) + ' at ' + r.moved.time + '. We\'ll text you the new time.' : 'Asked. We\'ll call to confirm.'); reload(); }
              else P.toast(r.error === 'taken' ? 'That time has just gone. Pick another.' : 'That didn\'t send. Please try again.');
            });
          });
          send.disabled = true;
          var choose = function (wrap, b) { Array.prototype.forEach.call(wrap.children, function (x) { x.setAttribute('aria-pressed', String(x === b)); }); };
          d.days.forEach(function (day) {
            var b = btn('pt-chip', '<span>' + shortDay(day.date) + '</span>', function () {
              choose(days, b); pick.date = day.date; pick.time = null; send.disabled = true; times.textContent = '';
              day.times.forEach(function (tm) {
                var tb = btn('pt-chip', '<span>' + tm + '</span>', function () { choose(times, tb); pick.time = tm; send.disabled = false; });
                times.appendChild(tb);
              });
            });
            days.appendChild(b);
          });
          area.appendChild(t('div', 'pt-label', 'Pick a day')); area.appendChild(days);
          area.appendChild(t('div', 'pt-label', 'Then a time')); area.appendChild(times);
          area.appendChild(send);
          area.appendChild(t('p', 'pt-hint', self ? 'Your survey moves straight away, with the same surveyor.' : 'This asks us to move it. Your survey stays as it is until we call to confirm.'));
        }, function () { go.classList.remove('busy'); go.disabled = false; P.toast('No connection. Please try again.'); });
      });
      area.appendChild(go);
    });
  }

  /* Straight to storage (the booking form's own route), then added to their survey. */
  function upload(file) {
    return fetch('/api/upload?mode=presign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: file.name, type: file.type }) })
      .then(function (r) { return r.json(); }).then(function (s) {
        if (s.ok && s.url) return fetch(s.url, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file }).then(function (r) { if (!r.ok) throw new Error(); return s.path; });
        return fetch('/api/upload?name=' + encodeURIComponent(file.name), { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file })
          .then(function (r) { return r.json(); }).then(function (x) { if (!x.ok || !x.path) throw new Error(); return x.path; });
      });
  }
  /* After sending, the page is drawn again with that fold open on what they sent. */
  var openNext = null;
  var ticked = function (tag, cls, text) { var e = h(tag, cls, I.check); e.appendChild(document.createTextNode(text)); return e; };
  var stamp = function (at) { var d = new Date(at); return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' }) + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }); };

  function photosFold(p, main, token, reload, api) {
    if (['requested', 'waiting', 'agent', 'deposit', 'booked'].indexOf(p.state) === -1) return;
    var n = p.photos || 0, show = openNext === 'photos';
    if (show) openNext = null;
    P.fold(main, n ? 'Your photos (' + n + ')' : 'Add photos', function (box) {
      if (n) {
        var grid = h('div', 'pt-photos');
        for (var i = 0; i < Math.min(n, 30); i += 1) { var a = t('a'), im = t('img'); a.href = api + '&file=photo&i=' + i; a.dataset.view = '1'; a.dataset.name = 'Your photo ' + (i + 1); im.src = a.href; im.alt = 'Your photo ' + (i + 1); im.loading = 'lazy'; a.appendChild(im); grid.appendChild(a); }
        box.appendChild(grid);
        box.appendChild(ticked('p', 'pt-sent', 'We have ' + (n === 1 ? 'your photo' : 'all ' + n) + '.'));
      }
      var lab = h('label', 'pt-btn ghost', '<span class="in">' + (n ? 'Add more photos' : 'Choose photos') + '</span>'), inp = t('input');
      inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true; inp.hidden = true; lab.appendChild(inp);
      var msg = t('p', 'pt-hint', n ? '' : 'Photos of the damp help us prepare.');
      inp.addEventListener('change', function () {
        var files = Array.prototype.slice.call(inp.files || [], 0, 10);
        if (!files.length) return;
        lab.classList.add('busy'); msg.hidden = false; msg.textContent = 'Sending ' + files.length + '…';
        var paths = [];
        files.reduce(function (ch, f) { return ch.then(function () { return upload(f).then(function (x) { paths.push(x); }, function () {}); }); }, Promise.resolve())
          .then(function () { return paths.length ? ask(token, { op: 'photos', paths: paths }) : { ok: false }; })
          .then(function (r) {
            lab.classList.remove('busy'); inp.value = '';
            if (r.ok) { P.toast(r.added + ' photo' + (r.added === 1 ? '' : 's') + ' added. Thank you.'); openNext = 'photos'; reload(); }
            else msg.textContent = r.error === 'too_many' ? 'That\'s as many as we can take here. Send any more by WhatsApp.' : 'Those didn\'t come through. Please try again, or send them by WhatsApp.';
          });
      });
      msg.hidden = !msg.textContent; box.appendChild(lab); box.appendChild(msg);
    }, show);
  }

  function messageFold(p, main, token, reload) {
    var sent = p.messages || [], show = openNext === 'message';
    if (show) openNext = null;
    P.fold(main, 'Message us', function (box) {
      /* What they have sent, so they know it arrived and what they asked. We reply by phone or text. */
      sent.forEach(function (m) {
        var b = h('div', 'pt-said'); b.appendChild(t('div', 'pt-quote', m.text));
        b.appendChild(ticked('small', 'pt-sent', 'Sent ' + stamp(m.at))); box.appendChild(b);
      });
      var f = h('label', 'pt-field'), ta = t('textarea'); ta.rows = 3; ta.maxLength = 1000; ta.setAttribute('aria-label', 'Your message'); ta.placeholder = sent.length ? 'Anything else?' : 'Your message';
      f.appendChild(ta); box.appendChild(f);
      var go = btn('pt-btn', '<span class="in">Send</span>', function () {
        if (ta.value.trim().length < 2) { ta.focus(); return; }
        go.classList.add('busy'); go.disabled = true;
        ask(token, { op: 'message', text: ta.value }).then(function (r) {
          go.classList.remove('busy'); go.disabled = false;
          if (r.ok) { ta.value = ''; P.toast('Sent. We\'ll call or text you back.'); openNext = 'message'; reload(); }
          else P.toast(r.error === 'too_many' ? 'Please call us on ' + p.brand.phoneLabel + '.' : 'That didn\'t send. Please try again.');
        });
      });
      box.appendChild(go);
      box.appendChild(t('p', 'pt-hint', 'Goes straight to the team, who will call or text you back. Urgent? Call ' + p.brand.phoneLabel + '.'));
    }, show);
  }

  function more(p, main, token, reload, api) {
    moveFold(p, main, token, reload);
    photosFold(p, main, token, reload, api);
    messageFold(p, main, token, reload);
  }

  global.PTASK = { top: top, more: more };
})(window);
