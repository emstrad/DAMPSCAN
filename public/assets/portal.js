/* The customer portal: reads /api/quote?doc=portal and draws the one next
   step as a big card, the step tracker, then cards for the survey, payments,
   history and help. Plain DOM, no build step. */
(function () {
  'use strict';
  var el = function (id) { return document.getElementById(id); };
  var t = new URLSearchParams(location.search).get('t') || '';
  var api = '/api/quote?doc=portal&t=' + encodeURIComponent(t);
  var node = function (tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  var pounds = function (p) { return '£' + (p / 100).toFixed(p % 100 ? 2 : 0); };
  var longDay = function (d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }); };
  var when = function (iso) { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' }); };
  var nice = function (tm) { var h = Number(tm.slice(0, 2)); return (h % 12 || 12) + (tm.slice(3) === '00' ? '' : ':' + tm.slice(3)) + (h < 12 ? 'am' : 'pm'); };
  var ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var CAL = ICON + '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';
  var PHONE = ICON + '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>';
  var LOCK = ICON + '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

  function row(box, label, value) { var r = node('div', 'pt-row'); r.appendChild(node('span', null, label)); var b = node('b', 'pt-val', value); r.appendChild(b); box.appendChild(r); return b; }
  /* Copy a detail in one tap; phones that block the clipboard get the old way. */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    var ta = node('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    var ok = document.execCommand('copy'); ta.remove();
    return ok ? Promise.resolve() : Promise.reject();
  }
  function copyBtn(box, text) {
    var c = node('button', 'pt-copy ms-press', 'Copy'); c.type = 'button'; c.setAttribute('aria-label', 'Copy ' + text);
    c.addEventListener('click', function () {
      copyText(text).then(function () {
        c.textContent = 'Copied'; c.classList.add('done', 'ms-swap');
        setTimeout(function () { c.textContent = 'Copy'; c.classList.remove('done', 'ms-swap'); }, 1800);
      }, function () { c.textContent = 'Press and hold to copy'; });
    });
    box.appendChild(c);
  }
  /* The business's bank details, one row per line ("Sort code: 00-00-00" or "Sort code 00-00-00"). */
  function bankRows(text) {
    return String(text).split(/\n+/).map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
      var m = l.match(/^([^:]+):\s*(.+)$/) || l.match(/^(sort code|account(?: number| no\.?)?|iban|bic|swift)\s+(.+)$/i);
      if (!m) return { label: 'Account name', value: l };
      return { label: m[1].charAt(0).toUpperCase() + m[1].slice(1), value: m[2] };
    });
  }
  function button(box, text, href, cls) { var a = node('a', 'pt-btn ms-press' + (cls ? ' ' + cls : ''), text); a.href = href; box.appendChild(a); return a; }
  function card(title, fill, open) {
    var d = node('details', 'pt-card'); if (open) d.open = true;
    d.appendChild(node('summary', null, title));
    fill(d); el('cards').appendChild(d);
  }
  function whenRow(box, v) { var w = node('div', 'pt-when'); w.innerHTML = CAL; w.appendChild(node('span', null, longDay(v.date) + ' at ' + nice(v.time))); box.appendChild(w); }

  /* How to pay, until online payment arrives: the bank details, the reference and a call. */
  function payBox(box, p, amount) {
    box.appendChild(node('div', 'pt-big', pounds(amount)));
    var bank = node('div', 'pt-bank');
    var line = function (label, value) {
      var r = node('div', 'pt-brow'), t = node('div');
      t.appendChild(node('small', null, label)); t.appendChild(node('b', null, value)); r.appendChild(t);
      copyBtn(r, value.replace(/^(\d{2})[ -]?(\d{2})[ -]?(\d{2})$/, '$1$2$3')); bank.appendChild(r);
    };
    if (p.payTo) bankRows(p.payTo).forEach(function (r) { line(r.label, r.value); });
    line('Reference', p.reference);
    box.appendChild(bank);
    var c = button(box, 'Pay by card: call us', 'tel:' + p.brand.phone, 'ghost'); c.insertAdjacentHTML('afterbegin', PHONE);
  }

  var TAG = { deposit: ['Action needed', 'act'], balance: ['Action needed', 'act'], report: ['Complete', 'ok'], visit: ['All set', 'ok'] };
  function next(p) {
    var n = el('next'), k = p.next.kind, tag = TAG[k] || ['In progress', ''];
    if (k === 'report') n.insertAdjacentHTML('beforeend', '<span class="ms-tick pt-done-tick"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>');
    n.appendChild(node('span', 'pt-tag ' + tag[1], tag[0]));
    if (k === 'deposit') {
      n.appendChild(node('h2', null, 'Pay your deposit to secure your survey'));
      whenRow(n, p.visit);
      payBox(n, p, p.money.depositPence);
      n.appendChild(node('p', 'pt-small', 'The rest, ' + pounds(p.money.pricePence - p.money.depositPence) + ', is due once your survey is done.'));
    } else if (k === 'visit') {
      n.appendChild(node('h2', null, 'Your survey is booked'));
      whenRow(n, p.visit);
      if (p.visit.surveyor) n.appendChild(node('p', null, p.visit.surveyor + ' will be your surveyor.'));
    } else if (k === 'balance') {
      n.appendChild(node('h2', null, 'Your report is ready'));
      n.appendChild(node('p', null, 'Pay the balance and your report unlocks straight away.'));
      payBox(n, p, p.money.balancePence);
      var l = node('p', 'pt-lock'); l.innerHTML = LOCK; l.appendChild(node('span', null, 'Report locked until paid in full')); n.appendChild(l);
    } else if (k === 'report') {
      n.appendChild(node('h2', null, 'Your report is ready'));
      n.appendChild(node('p', null, 'Thank you. Download it below and keep it for your records.'));
      button(n, 'Download your report', api + '&file=report');
      if (p.reviewUrl) { n.appendChild(node('p', 'pt-small', 'Happy with us? A quick Google review really helps a local business.')); var g = button(n, 'Leave a Google review', p.reviewUrl, 'ghost'); g.rel = 'noopener'; g.target = '_blank'; }
    } else {
      n.appendChild(node('h2', null, p.next.title));
      if (p.next.detail) n.appendChild(node('p', null, p.next.detail));
    }
  }

  function draw(p) {
    document.documentElement.setAttribute('data-site', p.site);
    document.title = 'Your survey | ' + p.brand.name;
    var words = p.brand.name.split(' ');
    var logo = el('brand'); logo.textContent = p.site === 'dampscan' ? 'Damp' : words[0] + ' ';
    logo.appendChild(node('b', null, p.site === 'dampscan' ? 'Scan' : words.slice(1).join(' ')));
    var call = el('call'); call.classList.add('ms-press'); call.href = 'tel:' + p.brand.phone; call.insertAdjacentHTML('afterbegin', PHONE);
    el('hi').textContent = p.firstName ? 'Hi ' + p.firstName : 'Your survey';
    el('sub').textContent = [p.survey, [p.address, p.postcode].filter(Boolean).join(', ')].filter(Boolean).join(' at ');
    next(p);

    if (p.next.kind !== 'cancelled') p.steps.forEach(function (s, i) {
      var done = i < p.step || p.next.kind === 'report', now = !done && i === p.step;
      var li = node('li', done ? 'done' : now ? 'now' : null);
      if (now) li.setAttribute('aria-current', 'step');
      if (i) li.appendChild(node('span', 'pt-line'));
      var dot = node('span', 'pt-dot' + (now ? ' now' : ''));
      if (done) { dot.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'; dot.style.animationDelay = (i * 60) + 'ms'; }
      li.appendChild(dot); li.appendChild(node('span', null, s));
      el('steps').appendChild(li);
    });

    if (p.visit) card('Your survey', function (b) {
      row(b, 'Date', longDay(p.visit.date));
      row(b, 'Time', nice(p.visit.time));
      if (p.visit.surveyor) row(b, 'Surveyor', p.visit.surveyor);
      if (p.survey) row(b, 'Survey', p.survey);
      if (p.address || p.postcode) row(b, 'Address', [p.address, p.postcode].filter(Boolean).join(', '));
      if (p.agent) row(b, 'Estate agent', p.agent);
    });
    if (p.money.pricePence) card('Payments', function (b) {
      var bar = node('div', 'pt-bar'), fill = node('i', 'ms-fill'); fill.style.setProperty('--ms-to', Math.round(100 * p.money.paidPence / p.money.pricePence) + '%'); bar.appendChild(fill); b.appendChild(bar);
      row(b, 'Survey fee', pounds(p.money.pricePence));
      row(b, 'Paid so far', pounds(p.money.paidPence));
      row(b, 'Left to pay', p.money.balancePence ? pounds(p.money.balancePence) : 'Nothing, thank you');
    });
    if (p.history.length) card('What has happened', function (b) {
      var ol = node('ol', 'pt-hist');
      p.history.slice().reverse().forEach(function (h) { var li = node('li', null, h.what); li.appendChild(node('small', null, when(h.at))); ol.appendChild(li); });
      b.appendChild(ol);
    });
    card('Need help?', function (b) {
      var chips = node('div', 'pt-chips'), c = node('a', 'pt-chip', 'Call ' + p.brand.phoneLabel); c.href = 'tel:' + p.brand.phone; chips.appendChild(c); b.appendChild(chips);
      b.appendChild(node('p', 'pt-small', 'This page is private to you and works until ' + when(p.expiresOn + 'T12:00:00Z') + '.'));
    });
    el('state').hidden = true; el('doc').hidden = false;
    /* The payment bar fills only once its card is opened, so the motion is seen. */
    document.querySelectorAll('.pt-card').forEach(function (d) { d.addEventListener('toggle', function () { var f = d.querySelector('.ms-fill'); if (f && d.open) { f.classList.remove('ms-fill'); void f.offsetWidth; f.classList.add('ms-fill'); } }); });
  }

  fetch(api).then(function (res) {
    if (res.status === 410) throw new Error('This link has run out. Give us a call and we will send you a new one.');
    if (!res.ok) throw new Error('This link is not working. It may have been replaced by a newer one.');
    return res.json();
  }).then(function (d) { draw(d.portal); }).catch(function (e) { var s = el('state'); s.textContent = ''; s.appendChild(node('p', 'pt-msg', e.message)); });
})();
