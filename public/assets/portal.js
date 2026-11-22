/* The customer's own page: reads /api/quote?doc=portal and draws the one
   state the server worked out (lib/portal-view.js), urgent first, with the
   rest folded. The site code (s1, s2) picks the palette; the brand's name and
   mark come from the server, so this shared file names neither brand. */
(function () {
  'use strict';
  var P = window.PT, I = P.I, h = P.h, t = P.t, btn = P.btn, money = P.money;
  /* The short link (/m/<token>) from a text, or the long one (?t=). */
  var token = new URLSearchParams(location.search).get('t') || (/^\/m\/([A-Za-z0-9_-]+)$/.exec(location.pathname) || [])[1] || '';
  var api = '/api/quote?doc=portal&t=' + encodeURIComponent(token);
  var main = document.getElementById('main');
  var shortDay = function (d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); };
  var when = function (iso) { return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }); };
  /* "9 to 10am", "11am to 12pm": the one-hour arrival window. */
  function windowOf(tm) {
    var a = Number(tm.slice(0, 2)), b = (a + 1) % 24, ap = function (x) { return x < 12 ? 'am' : 'pm'; }, n = function (x) { return (x % 12 || 12) + (tm.slice(3) === '00' ? '' : ':' + tm.slice(3)); };
    return ap(a) === ap(b) ? n(a) + ' to ' + n(b) + ap(b) : n(a) + ap(a) + ' to ' + n(b) + ap(b);
  }
  var TITLES = {
    requested: ['We have your request', '', 'Requested'], waiting: ['We\'ll arrange a time with you', 'warn', 'Waiting for a time'],
    agent: ['Arranging access with your agent', '', 'With the agent'], deposit: ['Secure your survey', 'warn', 'Deposit due'],
    booked: ['You\'re booked in', 'good', 'Confirmed'], writing: ['We\'re writing your report', '', 'Surveyed'],
    ready: ['Your report is ready', '', 'Balance due'], report: ['All done. Thank you!', 'good', 'Paid in full'],
    cancelled: ['Your survey is cancelled', '', 'Cancelled']
  };

  function brandBar(brand) {
    var top = h('div', 'pt-top'), logo = h('a', 'pt-logo'); logo.href = brand.origin; logo.setAttribute('aria-label', brand.name + ' home');
    var mk = brand.mark || {};
    if (mk.img) { var im = t('img'); im.src = mk.img; im.alt = mk.alt || brand.name; logo.appendChild(im); logo.appendChild(t('span', 'tag', mk.tag)); }
    else { var w = h('span', 'pt-word'), b = t('b', null, (mk.word || [brand.name])[0]); if (mk.word && mk.word[1]) b.appendChild(t('span', null, mk.word[1])); w.appendChild(b); if (mk.tag) w.appendChild(t('small', null, mk.tag)); logo.appendChild(w); }
    top.appendChild(logo); top.appendChild(h('span', 'pt-private', I.lock + '<span>Private to you</span>'));
    var head = document.getElementById('head'); head.textContent = ''; head.appendChild(top);
  }
  function hello(p, title, cls, badge) {
    var box = h('div', 'pt-hello');
    if (p && p.firstName) box.appendChild(t('small', null, 'Hi ' + p.firstName));
    /* The page's one h1 is in the HTML; it moves into the greeting with its words. */
    var h1 = document.getElementById('title'); h1.textContent = title; box.appendChild(h1);
    var b = h('span', 'pt-badge ' + cls); b.appendChild(t('span', null, badge)); box.appendChild(b); main.appendChild(box);
  }
  function steps(at) {
    var box = h('div', 'pt-steps'), track = h('div', 'pt-track'), fill = h('i'); track.appendChild(fill); box.appendChild(track);
    var lab = h('div', 'pt-steplabels'); ['Requested', 'Booked', 'Surveyed', 'Report', 'Done'].forEach(function (n, i) { lab.appendChild(t(i === at ? 'b' : 'span', null, n)); });
    box.appendChild(lab); main.appendChild(box);
    requestAnimationFrame(function () { requestAnimationFrame(function () { fill.style.width = (20 * (at + 1)) + '%'; }); });
  }
  /* What they have in with us now: anything refunded is taken off at once and said, so it is plain what happened. */
  var net = function (m) { return Math.max(0, m.paidPence - (m.refundedPence || 0)); };
  function moneyBar(parent, m) {
    var box = h('div', 'pt-money'), bar = h('div', 'pt-bar'), fill = h('i'); bar.appendChild(fill); box.appendChild(bar);
    var row = h('div'); row.appendChild(h('span', null, 'Paid <b>' + money(net(m)) + '</b>'));
    row.appendChild(h('span', null, m.refundedPence ? 'Refunded <b>' + money(m.refundedPence) + '</b>' : m.paidInFull ? '<b>Paid in full</b>' : 'Left <b>' + money(m.balancePence) + '</b>')); box.appendChild(row);
    parent.appendChild(box);
    requestAnimationFrame(function () { requestAnimationFrame(function () { fill.style.width = Math.min(100, Math.round(100 * net(m) / Math.max(1, m.pricePence))) + '%'; }); });
  }
  function lines(parent, m) {
    if (!m.lines) return;
    var box = h('div', 'pt-lines');
    m.lines.forEach(function (l) { var r = h('div'); r.appendChild(t('span', null, l.name)); r.appendChild(t('b', null, money(l.pence))); box.appendChild(r); });
    var tot = h('div', 'tot'); tot.appendChild(t('span', null, 'Total')); tot.appendChild(t('b', null, money(m.pricePence))); box.appendChild(tot); parent.appendChild(box);
  }
  /* A calendar file for the visit, made on the phone. */
  function calendar(p) {
    var v = p.visit, d = v.date.replace(/-/g, ''), hh = v.time.slice(0, 2), mm = v.time.slice(3, 5), end = String(Number(hh) + 1).padStart(2, '0');
    var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Survey//EN', 'BEGIN:VEVENT', 'UID:' + token.slice(0, 12) + '@survey', 'DTSTART;TZID=Europe/London:' + d + 'T' + hh + mm + '00',
      'DTEND;TZID=Europe/London:' + d + 'T' + end + mm + '00', 'SUMMARY:' + p.survey + ' (' + p.brand.name + ')', 'LOCATION:' + (p.address || '').replace(/,/g, '\\,'),
      'DESCRIPTION:Arriving ' + windowOf(v.time) + '. Questions? Call ' + p.brand.phoneLabel, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    var a = t('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'survey.ics'; document.body.appendChild(a); a.click(); a.remove();
  }
  function visitCard(p, actions) {
    var v = p.visit, card = h('div', 'pt-card'), row = h('div', 'pt-visit');
    var dt = new Date(v.date + 'T12:00:00Z'), opt = function (o) { return dt.toLocaleDateString('en-GB', Object.assign({ timeZone: 'UTC' }, o)); };
    var tile = h('div', 'pt-date'); tile.appendChild(t('small', null, opt({ weekday: 'short' }))); tile.appendChild(t('b', null, opt({ day: 'numeric' }))); tile.appendChild(t('span', null, opt({ month: 'short' }))); row.appendChild(tile);
    var d = h('div'); d.appendChild(t('h2', null, p.survey)); d.appendChild(t('p', null, 'Arriving ' + windowOf(v.time))); if (p.address) d.appendChild(t('p', null, p.address)); row.appendChild(d); card.appendChild(row);
    if (v.surveyor) { var who = h('div', 'pt-who'); who.appendChild(t('span', 'pt-avatar', v.surveyor.charAt(0))); var w = h('div'); w.appendChild(t('b', null, v.surveyor)); w.appendChild(t('small', null, 'Your surveyor')); who.appendChild(w); card.appendChild(who); }
    if (actions !== false) { var chips = h('div', 'pt-chips'); chips.appendChild(btn('pt-chip', I.cal + '<span>Add to calendar</span>', function () { calendar(p); })); if (window.PTASK) window.PTASK.chips(chips); card.appendChild(chips); }
    main.appendChild(card);
  }
  /* Their photos sit under Add photos (portal-asks.js), so they see each one arrived. */
  function enquiryFold(p) {
    if (!p.enquiry) return;
    P.fold(main, 'Your enquiry', function (box) {
      if (p.enquiry.issues.length) box.appendChild(t('p', null, p.enquiry.issues.join(', ')));
      if (p.enquiry.said) box.appendChild(t('div', 'pt-quote', p.enquiry.said));
    });
  }
  function paymentsFold(p) {
    var m = p.money;
    P.fold(main, 'Payments', function (box) {
      if (m.paidPence) moneyBar(box, m); else box.appendChild(t('span', null, 'Nothing paid yet.'));
      if (window.PTRECEIPT) window.PTRECEIPT.list(p, box);
      if (m.creditPence) box.appendChild(t('p', null, 'You\'ve paid ' + money(m.creditPence) + ' more than the total. We\'ll refund it.'));
      box.appendChild(t('span', null, 'Cancel ' + p.refundHours + ' hours or more before your survey for a full refund of anything paid. Within ' + p.refundHours + ' hours, the deposit is kept.'));
    });
  }
  function helpFold(p) {
    P.fold(main, 'Need help?', function (box) {
      box.appendChild(t('span', null, 'Call us on ' + p.brand.phoneLabel + ', Monday to Saturday.'));
      var a = h('a', 'pt-btn ghost', '<span class="in">' + I.phone + ' Call ' + p.brand.phoneLabel + '</span>'); a.href = 'tel:' + p.brand.phone; box.appendChild(a);
    });
  }
  function reportCard(p, locked) {
    var card = h('div', 'pt-card'), rep = h('div', 'pt-report');
    rep.appendChild(h('div', 'pt-doc' + (locked ? ' locked' : ''), '<i class="h"></i><i></i><i></i><i class="s"></i><i></i><i></i><i class="s"></i>' + (locked ? '<div class="lock"><span>' + I.lockBig + '</span></div>' : '')));
    var tx = h('div'); tx.appendChild(t('h2', null, 'Your damp survey report')); if (p.address) tx.appendChild(t('p', null, p.address)); if (locked) tx.appendChild(t('p', null, 'Unlocks when the balance is paid')); rep.appendChild(tx);
    card.appendChild(rep); main.appendChild(card); return card;
  }
  /* The download asks for the property postcode, so a forwarded link alone is not enough. */
  /* Paid in full and reported: the report opens on screen, with Download in the viewer's top bar. */
  function downloadGate(card, p) {
    openBtn(card, 'report', p.report.name, 'pt-btn', 'Open report', p);
    /* A second report, rarely: its own button beneath, opened the same way. */
    if (p.report.file2) openBtn(card, 'report2', p.report.name2, 'pt-btn ghost', 'Open second report', p);
    moneyBar(card, p.money);
  }
  function openBtn(card, which, name, cls, label, p) {
    var msg = t('p', 'pt-hint', ''); msg.hidden = true;
    var got = null, show = function () { if (window.DSVIEW && got) window.DSVIEW.open([{ blob: got, name: name }], 0); };
    var dl = btn(cls, '<span class="in">' + I.dl + ' ' + label + '</span>', function () {
      if (got) return show();
      dl.classList.add('busy'); dl.disabled = true;
      fetch(api + '&file=' + which).then(function (r) {
        dl.classList.remove('busy'); dl.disabled = false;
        if (r.ok) return r.blob().then(function (b) { got = b; show(); });
        msg.hidden = false; msg.className = 'pt-hint bad'; msg.textContent = 'That didn\'t open. Please try again, or call us on ' + p.brand.phoneLabel + '.';
      }, function () { dl.classList.remove('busy'); dl.disabled = false; msg.hidden = false; msg.className = 'pt-hint bad'; msg.textContent = 'No connection. Please try again.'; });
    });
    card.appendChild(dl); card.appendChild(msg);
  }

  /* Starts a payment on Stripe's secure page; it comes back here with &paid=1. */
  pay.token = token;
  function pay(pence) {
    return fetch('/api/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ doc: 'portal', op: 'pay', t: token, pence: pence }) })
      .then(function (r) { return r.json(); }).then(function (d) { if (!d.ok || !d.url) throw new Error(); location.href = d.url; });
  }
  /* Back from paying: confirming (checked again every few seconds), declined, or done. */
  var tries = 0;
  function payment(p) {
    var x = p.payment, card;
    if (!x || x.state === 'completed') {
      if (x && x.state === 'completed') { P.toast(money(x.pence) + ' received. Thank you!'); history.replaceState(null, '', location.pathname + '?t=' + encodeURIComponent(token)); }
      return false;
    }
    var h1 = document.getElementById('title'); main.textContent = ''; main.appendChild(h1); brandBar(p.brand);
    if (x.state === 'pending' && tries < 20) {
      hello(p, 'Confirming your payment', '', 'Checking');
      card = h('div', 'pt-card center'); card.appendChild(h('div', 'pt-ring')); card.appendChild(t('h2', null, 'Just a moment'));
      card.appendChild(t('p', null, 'We\'re confirming your payment of ' + money(x.pence) + '. This page updates by itself.')); main.appendChild(card);
      tries += 1; setTimeout(load, 3000); return true;
    }
    hello(p, x.state === 'pending' ? 'Still waiting on the bank' : 'That payment didn\'t go through', x.state === 'pending' ? 'warn' : 'bad', x.state === 'pending' ? 'Checking' : 'Not paid');
    card = h('div', 'pt-card center'); card.appendChild(h('div', 'pt-cross', '!'));
    card.appendChild(t('h2', null, x.state === 'pending' ? 'We\'ll update this page when it lands' : 'Nothing was taken'));
    card.appendChild(t('p', null, x.state === 'pending' ? 'If you paid, you don\'t need to do anything. If not, you can try again.' : 'Your bank declined it, or it was cancelled. Try again, or pay by bank transfer.'));
    card.appendChild(btn('pt-btn', '<span class="in">Try again</span>', function () { location.href = location.pathname + '?t=' + encodeURIComponent(token); }));
    main.appendChild(card); return true;
  }

  function draw(p) {
    document.documentElement.dataset.site = p.code;
    document.title = 'Your survey · ' + p.brand.name;
    if (payment(p)) return;
    var h1 = document.getElementById('title'); main.textContent = ''; main.appendChild(h1);
    brandBar(p.brand);
    var T = TITLES[p.state] || TITLES.waiting, s = p.state, card;
    if (s === 'cancelled') T = ['Your survey is cancelled', '', p.cancel.rule === 'refund' ? 'Refund on its way' : p.cancel.rule === 'refunded' ? 'Refunded' : 'Cancelled'];
    hello(p, T[0], T[1], T[2]);
    if (window.PTASK) window.PTASK.top(p, main, token, load);
    if (s !== 'cancelled') steps(p.step);
    if (s === 'requested') {
      card = h('div', 'pt-card'); card.appendChild(t('h2', null, shortDay(p.requested.date) + (p.requested.time ? ' at ' + p.requested.time : '') + ', requested'));
      card.appendChild(t('p', null, 'This time isn\'t booked yet. We\'ll text you as soon as it\'s confirmed.')); main.appendChild(card);
    } else if (s === 'waiting') {
      card = h('div', 'pt-card'); card.appendChild(t('h2', null, 'No date fixed yet'));
      card.appendChild(t('p', null, p.money.paidPence ? 'Your payment is kept for the new date. We\'ll be in touch to arrange it.' : 'We\'ll be in touch to arrange a time that suits.')); main.appendChild(card);
    } else if (s === 'agent') {
      card = h('div', 'pt-card'); card.appendChild(P.banner('', 'We\'re arranging access with', p.agent ? p.agent + '.' : 'your estate agent.'));
      card.appendChild(t('p', null, 'You don\'t need to be there. We\'ll text you the confirmed time.')); main.appendChild(card);
    } else if (s === 'deposit') {
      if (p.money.lines) { card = h('div', 'pt-card soft'); lines(card, p.money); main.appendChild(card); }
      main.appendChild(P.payCard(p, false, pay)); if (p.visit) visitCard(p);
    } else if (s === 'booked') {
      card = h('div', 'pt-card center'); card.appendChild(h('div', 'pt-tick', I.tick));
      card.appendChild(t('h2', null, net(p.money) ? money(net(p.money)) + ' received' : 'You\'re all set')); card.appendChild(t('p', null, 'Your survey is confirmed.'));
      if (p.money.paidPence) moneyBar(card, p.money); main.appendChild(card); visitCard(p);
    } else if (s === 'writing') {
      card = h('div', 'pt-card'); card.appendChild(t('h2', null, 'Survey done'));
      card.appendChild(t('p', null, (p.visit && p.visit.surveyor ? p.visit.surveyor : 'Your surveyor') + ' is writing up your report. We\'ll text you as soon as it\'s ready.')); moneyBar(card, p.money); main.appendChild(card);
      /* Still owed after the visit: they can pay now (the deposit first if it never came, else the rest). */
      if (p.money.balancePence > 0) main.appendChild(P.payCard(p, p.money.depositPaid, pay));
    } else if (s === 'ready') {
      reportCard(p, true); if (p.money.lines) { card = h('div', 'pt-card soft'); lines(card, p.money); main.appendChild(card); }
      main.appendChild(P.payCard(p, true, pay));
    } else if (s === 'report') {
      var rc = reportCard(p, false);
      if (p.report.file) downloadGate(rc, p);
      else { rc.appendChild(t('p', null, 'We\'ve emailed your report to you. Can\'t find it? Call us on ' + p.brand.phoneLabel + '.')); moneyBar(rc, p.money); }
      if (p.reviewUrl) {
        card = h('div', 'pt-card center'); card.appendChild(t('div', 'pt-stars', '★★★★★')); card.appendChild(t('h2', null, 'How did we do?'));
        card.appendChild(t('p', null, 'Your review on Google helps other homeowners find us.'));
        var rv = h('a', 'pt-btn', '<span class="in">Review us on Google</span>'); rv.href = p.reviewUrl; rv.target = '_blank'; rv.rel = 'noopener'; card.appendChild(rv); main.appendChild(card);
      }
    } else if (s === 'cancelled') {
      card = h('div', 'pt-card'); var c = p.cancel;
      if (c.rule === 'refund') card.appendChild(P.banner('good', 'Cancelled ' + p.refundHours + ' hours or more before your survey, so you get a full refund of', money(c.pence) + '.'));
      else if (c.rule === 'refunded') card.appendChild(P.banner('good', 'Your refund has been made:', money(p.money.refundedPence) + '.'));
      else if (c.rule === 'kept') {
        card.appendChild(P.banner('', 'Cancelled within ' + p.refundHours + ' hours of your survey, so the deposit is kept, as set out when you booked:', money(c.keptPence) + '.'));
        if (c.refundPence) card.appendChild(t('p', null, 'Anything you paid over the deposit comes back to you: ' + money(c.refundPence) + '.'));
      }
      if (c.rule === 'kept') card.appendChild(t('p', null, 'If something has happened, call us and we\'ll take a look.'));
      if (card.children.length) main.appendChild(card);
    }
    if (['requested', 'waiting', 'agent', 'deposit', 'booked'].indexOf(s) !== -1) enquiryFold(p);
    /* Cancelled too: booking again and their messages, theirs and ours, stay, ahead of the payments there (the owner, 22 Nov 2026). */
    if (s === 'cancelled' && window.PTASK) window.PTASK.more(p, main, token, load, api);
    if (s !== 'requested') paymentsFold(p);
    if (s !== 'cancelled' && window.PTASK) window.PTASK.more(p, main, token, load, api);
    helpFold(p);
    main.appendChild(t('p', 'pt-foot', 'Private link, works until ' + when(p.expiresOn) + ' · Damp Surveying Limited'));
  }

  /* An expired link asks the team for a fresh one; we send it, never the page. */
  function expired(d) {
    if (d.code) document.documentElement.dataset.site = d.code;
    if (d.brand) document.title = 'Your survey · ' + d.brand.name;
    var h1 = document.getElementById('title'); main.textContent = ''; main.appendChild(h1);
    if (d.brand) brandBar(d.brand);
    hello(null, 'This link has expired', 'bad', 'Expired');
    var card = h('div', 'pt-card'); card.appendChild(t('p', null, 'For your privacy, links work for 12 months. We\'ll send you a fresh one.'));
    var go = btn('pt-btn', '<span class="in">Send me a new link</span>', function () {
      go.classList.add('busy'); go.disabled = true;
      fetch('/api/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ doc: 'portal', op: 'newlink', t: token }) })
        .then(function (r) { go.classList.remove('busy'); if (!r.ok) throw new Error(); go.classList.add('ok'); go.innerHTML = '<span class="in">' + I.check + ' Requested. We\'ll text it to you.</span>'; })
        .catch(function () { go.disabled = false; P.toast('That didn\'t send. Please try again.'); });
    });
    card.appendChild(go); if (d.brand) card.appendChild(t('p', 'pt-hint', 'Or call ' + d.brand.phoneLabel + '.')); main.appendChild(card);
    main.appendChild(t('p', 'pt-foot', 'Damp Surveying Limited'));
  }
  function gone(text) { var h1 = document.getElementById('title'); main.textContent = ''; main.appendChild(h1); hello(null, 'We can\'t find this page', 'bad', 'Not found'); var c = h('div', 'pt-card'); c.appendChild(t('p', 'pt-msg', text)); main.appendChild(c); }

  /* What the customer would notice change: drawn again only when one of these moves. */
  function sig(p) { return JSON.stringify([p.state, p.onWay, p.money && p.money.paidPence, p.money && p.money.refundedPence, p.report, p.visit, p.move, p.messages && p.messages.length, p.photos]); }
  var last = null;
  function load() {
    var paid = new URLSearchParams(location.search).get('paid') ? '&paid=1' : '';
    fetch(api + paid).then(function (r) { return r.json().then(function (d) { return { status: r.status, d: d }; }); }).then(function (x) {
      if (x.status === 410) return expired(x.d);
      if (!x.d.ok) return gone('Check you opened the whole link from your text or email, or call us.');
      last = sig(x.d.portal);
      draw(x.d.portal);
    }).catch(function () { gone('No connection. Check your signal and try again.'); });
  }
  /* The page keeps itself up to date while it is open (On my way, a payment,
     the report), every half minute and on coming back to it; never while they
     are typing or a fold is being used, so nothing is snatched from under them. */
  function busy() { var a = document.activeElement; return (a && main.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) || main.querySelector('.busy, dialog[open]'); }
  function poll() {
    if (document.visibilityState !== 'visible' || last === null || busy()) return;
    fetch(api + '&poll=1').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || !d.ok || busy()) return;
      var s = sig(d.portal);
      if (s !== last) { last = s; draw(d.portal); }
    }).catch(function () {});
  }
  setInterval(poll, 30000);
  document.addEventListener('visibilitychange', poll);
  /* Back from Stripe's page, Safari shows this page exactly as it was left, spinner and all: start it afresh instead. */
  window.addEventListener('pageshow', function (e) { if (e.persisted) location.reload(); });
  load();
})();
