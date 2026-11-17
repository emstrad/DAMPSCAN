/* Company, Week: the Monday briefing (the owner, 16 Nov 2026). Last week
   against the week before, Needs you now, the week ahead day by day, who is
   still to book and Google Ads this month; each row opens where it is dealt
   with. Figures from lib/company-week.js; the Monday push opens this tab. */
(function (global) {
  'use strict';
  var U = global.DSUI, node = U.node;
  var money = function (p) { return '£' + Math.round((Number(p) || 0) / 100).toLocaleString('en-GB'); };
  var day = function (d, o) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', Object.assign({ day: 'numeric', month: 'short', timeZone: 'UTC' }, o || {})); };
  var loaded = false;

  (global.DSCOTABS = global.DSCOTABS || {}).week = function () { if (!loaded) load(); };

  function row(label, sub, figure, go, cls) {
    var b = node('button', 'c-row' + (cls ? ' ' + cls : '')); b.type = 'button';
    var l = node('span', 'c-l'); l.appendChild(node('b', null, label)); if (sub) l.appendChild(node('small', null, sub));
    var r = node('span', 'c-r'); if (figure) r.appendChild(node('span', 'c-amt', figure)); r.appendChild(node('span', 'c-chev', '›'));
    b.appendChild(l); b.appendChild(r);
    b.addEventListener('click', go);
    return b;
  }
  var to = function (href) { return function () { global.location.href = href; }; };
  var tab = function (t, who) { return function () { if (global.DSCOSHOW) global.DSCOSHOW(t); if (who && global.DSCOPAY) global.DSCOPAY.open(who); }; };

  async function load() {
    var box = document.getElementById('tab-week');
    var d;
    try { d = await U.get('/api/admin/pay?view=week'); } catch (e) { box.textContent = 'The briefing is for the owners.'; return; }
    loaded = true; box.textContent = '';
    var sec = function (title) { var s = node('section', 'mn-sec'); s.appendChild(node('h2', null, title)); box.appendChild(s); return s; };

    /* Last week first, each against the week before. */
    var s = sec('Last week, ' + day(d.from) + ' to ' + day(d.to));
    var sum = node('div', 'c-summary');
    var fig = function (label, now, before, show) {
      var c = node('div'); c.appendChild(node('span', 'c-label', label)); c.appendChild(node('b', null, show(now)));
      c.appendChild(node('small', 'c-sub', show(before) + ' the week before')); sum.appendChild(c);
    };
    var n = function (x) { return String(x); };
    fig('Money in', d.last.in, d.before.in, money);
    fig('Enquiries', d.last.enquiries, d.before.enquiries, n);
    fig('Booked', d.last.booked, d.before.booked, n);
    fig('Surveys done', d.last.surveys, d.before.surveys, n);
    s.appendChild(sum);

    /* What needs an owner, the same rows as Overview, then anything late. */
    var now = d.attention.slice();
    if (now.length || d.reportsLate || d.problems) {
      var a = sec('Needs you now'), rows = node('div', 'c-rows ov-rows');
      if (d.reportsLate) rows.appendChild(row(d.reportsLate + ' report' + (d.reportsLate === 1 ? '' : 's') + ' late', null, null, to('/staff/reports.html?area=damp'), 'is-bad'));
      if (d.problems) rows.appendChild(row(d.problems + ' website problem' + (d.problems === 1 ? '' : 's') + ' last week', 'Form refused, page or server errors', null, tab('growth'), 'is-bad'));
      now.forEach(function (x) { rows.appendChild(row(x.label || x.text, x.sub, x.figure, x.href ? to(x.href) : tab(x.tab, x.who), x.bad ? 'is-bad' : '')); });
      a.appendChild(rows);
    }

    /* The week ahead, a day to a row: a day with nothing booked shows as free. */
    var w = sec('This week'), days = node('div', 'c-rows');
    d.ahead.days.forEach(function (x) {
      if (x.past && !x.total) return;
      var who = x.by.map(function (b) { return b.who + ' ' + b.n; }).join(', ');
      var b = row(day(x.day, { weekday: 'short' }), who || null, x.total ? x.total + ' survey' + (x.total === 1 ? '' : 's') : null, to('/staff/schedule.html?area=damp&day=' + x.day), x.past ? 'is-zero' : '');
      if (!x.total) b.querySelector('.c-r').insertBefore(node('span', 'c-tag is-good', 'Free'), b.querySelector('.c-chev'));
      days.appendChild(b);
    });
    w.appendChild(days);

    var more = sec('Work coming in'), list = node('div', 'c-rows');
    list.appendChild(row(d.toBook.n + ' customer' + (d.toBook.n === 1 ? '' : 's') + ' to book', d.toBook.held ? d.toBook.held + ' holding a time' : null, null, to('/staff/schedule.html?area=damp')));
    var ads = d.ads;
    list.appendChild(row('Google Ads this month', ads.spend ? money(ads.spend) + ' spent, ' + ads.booked + ' booked' + (ads.perBooked !== null ? ', ' + money(ads.perBooked) + ' each' : '') : 'Spend not logged yet', ads.money ? money(ads.money) : null, tab('growth')));
    more.appendChild(list);
  }
})(window);
