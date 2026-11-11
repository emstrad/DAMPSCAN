/* What a customer can ask from their page (lib/portal-asks.js): On my way
   shown at the top on the day, Ask to move (the surveyors' real free times,
   a request until the team confirms), add photos before the visit, and
   Message us. Nothing here changes the booking. Uses the page's own parts
   (portal-parts.js) so it names neither brand. */
(function (global) {
  'use strict';
  var P = global.PT, h = P.h, t = P.t, btn = P.btn;
  var shortDay = function (d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); };
  var ask = function (token, body) {
    return fetch('/api/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ doc: 'portal', t: token }, body)) })
      .then(function (r) { return r.json().catch(function () { return {}; }); });
  };

  /* On the day, first thing under the greeting. */
  function top(p, main) {
    if (!p.onWay) return;
    var card = h('div', 'pt-card'); card.appendChild(P.banner('good', (p.onWay.surveyor || 'Your surveyor') + ' is on the way', 'to you now.'));
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
          var send = btn('pt-btn', '<span class="in">Ask for this time</span>', function () {
            if (!pick.date || !pick.time) return;
            send.classList.add('busy'); send.disabled = true;
            ask(token, { op: 'move', date: pick.date, time: pick.time }).then(function (r) {
              send.classList.remove('busy'); send.disabled = false;
              if (r.ok) { P.toast('Asked. We\'ll call to confirm.'); reload(); }
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
          area.appendChild(t('p', 'pt-hint', 'This asks us to move it. Your survey stays as it is until we call to confirm.'));
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
  function photosFold(p, main, token, reload) {
    if (['requested', 'waiting', 'agent', 'deposit', 'booked'].indexOf(p.state) === -1) return;
    P.fold(main, 'Add photos', function (box) {
      var lab = h('label', 'pt-btn ghost', '<span class="in">Choose photos</span>'), inp = t('input');
      inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true; inp.hidden = true; lab.appendChild(inp);
      var msg = t('p', 'pt-hint', 'Photos of the damp help us prepare.');
      inp.addEventListener('change', function () {
        var files = Array.prototype.slice.call(inp.files || [], 0, 10);
        if (!files.length) return;
        lab.classList.add('busy'); msg.textContent = 'Sending ' + files.length + '…';
        var paths = [];
        files.reduce(function (ch, f) { return ch.then(function () { return upload(f).then(function (x) { paths.push(x); }, function () {}); }); }, Promise.resolve())
          .then(function () { return paths.length ? ask(token, { op: 'photos', paths: paths }) : { ok: false }; })
          .then(function (r) {
            lab.classList.remove('busy'); inp.value = '';
            if (r.ok) { P.toast(r.added + ' photo' + (r.added === 1 ? '' : 's') + ' added. Thank you.'); reload(); }
            else msg.textContent = 'Those didn\'t come through. Please try again, or send them by WhatsApp.';
          });
      });
      box.appendChild(lab); box.appendChild(msg);
    });
  }

  function messageFold(p, main, token) {
    P.fold(main, 'Message us', function (box) {
      var f = h('label', 'pt-field'), ta = t('textarea'); ta.rows = 3; ta.maxLength = 1000; ta.setAttribute('aria-label', 'Your message'); ta.placeholder = 'Your message';
      f.appendChild(ta); box.appendChild(f);
      var go = btn('pt-btn', '<span class="in">Send</span>', function () {
        if (ta.value.trim().length < 2) { ta.focus(); return; }
        go.classList.add('busy'); go.disabled = true;
        ask(token, { op: 'message', text: ta.value }).then(function (r) {
          go.classList.remove('busy'); go.disabled = false;
          if (r.ok) { ta.value = ''; P.toast('Sent. We\'ll get back to you.'); }
          else P.toast(r.error === 'too_many' ? 'Please call us on ' + p.brand.phoneLabel + '.' : 'That didn\'t send. Please try again.');
        });
      });
      box.appendChild(go);
      box.appendChild(t('p', 'pt-hint', 'Goes straight to the team. Urgent? Call ' + p.brand.phoneLabel + '.'));
    });
  }

  function more(p, main, token, reload) {
    moveFold(p, main, token, reload);
    photosFold(p, main, token, reload);
    messageFold(p, main, token);
  }

  global.PTASK = { top: top, more: more };
})(window);
