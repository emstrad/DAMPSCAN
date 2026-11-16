/* Records: the damp brands' all-time bests, to celebrate (lib/job-totals.js
   records()). Amounts show only for whoever manages a brand; the server
   leaves them out for everyone else. */
(function (global) {
  'use strict';
  var U = global.DSUI;
  var el = function (id) { return document.getElementById(id); };
  var site = '';

  var month = function (m) { return new Date(m + '-15T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }); };
  var day = function (d) { return new Date(String(d).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };
  var plural = function (n, one, many) { return U.num(n) + ' ' + (n === 1 ? one : many || one + 's'); };
  var hours = function (h) { return h < 24 ? Math.round(h) + (Math.round(h) === 1 ? ' hour' : ' hours') : (Math.round(h / 24 * 10) / 10) + ' days'; };

  function tile(mount, k, v, s, key) {
    var d = U.node('div', 'tile' + (key ? ' is-key' : ''));
    d.appendChild(U.node('span', 'k', k));
    d.appendChild(U.node('span', 'v', v));
    if (s) d.appendChild(U.node('span', 's', s));
    mount.appendChild(d);
  }

  function board(mount, rows, label, value) {
    mount.textContent = '';
    if (!rows.length) { mount.appendChild(U.node('li', 'empty', 'Nothing yet.')); return; }
    var max = Math.max.apply(null, rows.map(value).concat(1));
    rows.forEach(function (r, i) {
      var li = U.node('li', i === 0 ? 'is-top' : null);
      var head = U.node('div', 'dash-bar-head');
      head.appendChild(U.node('span', 'dash-bar-name', label(r)));
      head.appendChild(U.node('span', 'dash-bar-num', plural(value(r), 'survey')));
      li.appendChild(head);
      var bar = U.node('div', 'dash-bar'); var fill = U.node('span');
      fill.style.width = Math.max(3, Math.round(value(r) / max * 100)) + '%';
      bar.appendChild(fill); li.appendChild(bar);
      mount.appendChild(li);
    });
  }

  function render(r) {
    var hero = el('hero');
    hero.textContent = '';
    hero.appendChild(U.node('span', 'records-big', U.num(r.surveys)));
    hero.appendChild(U.node('span', 'records-label', 'surveys done since ' + (r.firstSurvey ? day(r.firstSurvey) : 'the start')));
    var extra = [plural(r.areas, 'postcode area')];
    if (r.valuePence != null) extra.push(U.money(r.valuePence) + ' in surveys');
    if (r.remedialPence) extra.push(U.money(r.remedialPence) + ' remedial won');
    hero.appendChild(U.node('span', 'records-sub', extra.join(' · ')));
    if (r.nextMilestone) hero.appendChild(U.node('span', 'records-next', plural(r.nextMilestone.toGo, 'more survey') + ' to reach ' + U.num(r.nextMilestone.at) + '!'));

    var bests = el('bests');
    bests.textContent = '';
    if (r.bestMonth) {
      var beat = r.thisMonth >= r.bestMonth.surveys && r.thisMonth > 0;
      tile(bests, 'Best month', plural(r.bestMonth.surveys, 'survey'), month(r.bestMonth.month) + (r.bestMonthValuePence != null ? ', ' + U.money(r.bestMonthValuePence) : ''), true);
      tile(bests, 'This month so far', plural(r.thisMonth, 'survey'), beat ? 'Equal to or beating the record!' : (r.bestMonth.surveys - r.thisMonth) + ' to beat the best month', beat);
    }
    if (r.bestWeek) tile(bests, 'Best week', plural(r.bestWeek.surveys, 'survey'), 'w/c ' + day(r.bestWeek.from));
    if (r.bestDay) tile(bests, 'Busiest day', plural(r.bestDay.surveys, 'survey'), day(r.bestDay.date));
    if (r.ratings.count) tile(bests, 'Ratings', (r.ratings.average || 0) + ' stars', plural(r.ratings.fiveStar, 'five-star rating') + ' of ' + r.ratings.count);
    if (r.reports.fastestHours != null) tile(bests, 'Fastest report', hours(r.reports.fastestHours), 'after the survey; ' + hours(r.reports.averageHours || 0) + ' on average');
    var b = r.brands || {};
    if (b.dampscan || b['ati-london']) tile(bests, 'By brand', U.num(b.dampscan || 0) + ' / ' + U.num(b['ati-london'] || 0), 'DampScan / ATi');

    board(el('people'), r.surveyors, function (p) { return p.name; }, function (p) { return p.surveys; });
    board(el('areas'), r.topAreas, function (a) { return a.area; }, function (a) { return a.surveys; });

    var miles = el('miles');
    miles.textContent = '';
    r.milestones.forEach(function (m) {
      var li = U.node('li');
      li.appendChild(U.node('span', 'records-mile', m.survey === 1 ? 'First survey' : U.num(m.survey) + (m.survey === 1 ? 'st' : 'th') + ' survey'));
      li.appendChild(U.node('span', 'dash-bar-num', day(m.date)));
      miles.appendChild(li);
    });
    if (r.nextMilestone) {
      var next = U.node('li', 'is-next');
      next.appendChild(U.node('span', 'records-mile', U.num(r.nextMilestone.at) + 'th survey'));
      next.appendChild(U.node('span', 'dash-bar-num', plural(r.nextMilestone.toGo, 'to go', 'to go')));
      miles.appendChild(next);
    }
  }

  async function load() {
    try {
      var data = await U.get('/api/admin/jobs?view=records' + (site ? '&site=' + site : ''));
      if (!data.records) { el('state').textContent = 'Records are for ATi and DampScan.'; return; }
      render(data.records);
      el('state').hidden = true;
      el('content').hidden = false;
    } catch (e) {
      if (e.message !== 'unauthorised') el('state').textContent = 'Could not load the records.';
    }
  }

  document.querySelectorAll('[data-site]').forEach(function (p) {
    p.addEventListener('click', function () {
      site = p.dataset.site;
      document.querySelectorAll('[data-site]').forEach(function (q) { q.setAttribute('aria-pressed', String(q === p)); });
      load();
    });
  });
  if (U.scopePills) U.scopePills('[data-site]');
  var refresh = el('refresh'); if (refresh) refresh.addEventListener('click', load);
  var out = el('logout'); if (out) out.addEventListener('click', async function () { await fetch('/api/auth/logout', { method: 'POST' }); location.replace('/staff'); });
  load();
})(window);
