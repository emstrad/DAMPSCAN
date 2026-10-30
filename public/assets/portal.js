/* The customer portal: reads /api/quote?doc=portal and draws the next step,
   the progress line and the folded rows. Plain DOM, no build step. */
(function () {
  'use strict';
  var el = function (id) { return document.getElementById(id); };
  var t = new URLSearchParams(location.search).get('t') || '';
  var api = '/api/quote?doc=portal&t=' + encodeURIComponent(t);
  var node = function (tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  var pounds = function (p) { return '£' + (p / 100).toFixed(p % 100 ? 2 : 0); };
  var longDay = function (d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }); };
  var when = function (iso) { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' }); };
  var nice = function (tm) { var h = Number(tm.slice(0, 2)); return (h % 12 || 12) + (tm.slice(3) === '00' ? '' : ':' + tm.slice(3)) + (h < 12 ? 'am' : 'pm'); };

  function row(box, label, value) { var r = node('div', 'pt-row'); r.appendChild(node('span', null, label)); r.appendChild(node('b', null, value)); box.appendChild(r); }
  function fold(title, fill, open) {
    var d = node('details', 'pt-fold'); if (open) d.open = true;
    d.appendChild(node('summary', null, title));
    var body = node('div'); fill(body); d.appendChild(body);
    el('folds').appendChild(d);
  }
  function button(box, text, href) { var a = node('a', 'pt-btn', text); a.href = href; box.appendChild(a); return a; }

  function draw(p) {
    document.title = 'Your survey | ' + p.brand.name;
    el('brand').textContent = p.brand.name;
    el('call').href = 'tel:' + p.brand.phone;
    el('hi').textContent = p.firstName ? 'Hi ' + p.firstName : 'Your survey';
    var n = el('next');
    n.appendChild(node('h2', null, p.next.title));
    if (p.visit && ['deposit', 'visit'].indexOf(p.next.kind) >= 0) n.appendChild(node('p', 'pt-when', longDay(p.visit.date) + ' at ' + nice(p.visit.time)));
    if (p.next.detail) n.appendChild(node('p', null, p.next.detail));
    if (p.next.kind === 'deposit' || p.next.kind === 'balance') {
      if (p.payTo) n.appendChild(node('p', 'pt-pay', p.payTo));
      button(n, 'Call to pay by card', 'tel:' + p.brand.phone);
    }
    if (p.report) {
      var r = p.report.unlocked ? button(n, 'Download your report', api + '&file=report') : button(n, 'Report unlocks once paid in full', '#');
      if (!p.report.unlocked) { r.setAttribute('aria-disabled', 'true'); r.addEventListener('click', function (e) { e.preventDefault(); }); }
    }
    if (p.reviewUrl) { var g = button(n, 'Leave us a Google review', p.reviewUrl); g.rel = 'noopener'; g.target = '_blank'; }

    if (p.next.kind !== 'cancelled') p.steps.forEach(function (s, i) { el('steps').appendChild(node('li', i <= p.step ? 'on' : null, s)); });

    if (p.visit) fold('Your survey', function (b) {
      row(b, 'When', longDay(p.visit.date) + ', ' + nice(p.visit.time));
      if (p.visit.surveyor) row(b, 'Surveyor', p.visit.surveyor);
      if (p.survey) row(b, 'Survey', p.survey);
      if (p.address || p.postcode) row(b, 'Where', [p.address, p.postcode].filter(Boolean).join(', '));
      if (p.agent) row(b, 'Estate agent', p.agent);
    });
    if (p.money.pricePence) fold('Payments', function (b) {
      row(b, 'Survey', pounds(p.money.pricePence));
      row(b, 'Deposit', p.money.depositPaid ? 'Paid' : pounds(p.money.depositPence) + ' due');
      row(b, 'Left to pay', p.money.balancePence ? pounds(p.money.balancePence) : 'Nothing');
    });
    if (p.history.length) fold('History', function (b) { p.history.slice().reverse().forEach(function (h) { row(b, h.what, when(h.at)); }); });
    fold('Need anything?', function (b) {
      var c = node('a', 'pt-chip', 'Call ' + p.brand.phoneLabel); c.href = 'tel:' + p.brand.phone; b.appendChild(c);
      b.appendChild(node('p', 'pt-small', 'This link is yours and works until ' + when(p.expiresOn + 'T12:00:00Z') + '.'));
    });
    el('state').hidden = true; el('doc').hidden = false;
  }

  fetch(api).then(function (res) {
    if (res.status === 410) throw new Error('This link has run out. Call us and we will send you a new one.');
    if (!res.ok) throw new Error('This link is not working. It may have been replaced by a newer one.');
    return res.json();
  }).then(function (d) { draw(d.portal); }).catch(function (e) { el('state').textContent = e.message; });
})();
