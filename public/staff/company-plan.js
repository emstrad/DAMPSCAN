/* Company, Growth: the plan at a glance (the owner, 20 Nov 2026). The phase and
   its weekly target, surveys a week as columns against the target line, each
   surveyor's load against ten a week, and the hire signal. Tap or hover a mark
   for its figure. Figures from lib/growth-plan.js. */
(function (global) {
  'use strict';
  var U = global.DSUI, node = U.node;
  var day = function (d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }); };
  var until = function (d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }); };

  function mark(el, text, out) {
    el.tabIndex = 0; el.setAttribute('role', 'img'); el.setAttribute('aria-label', text); el.title = text;
    var show = function () { out.textContent = text; };
    el.addEventListener('mouseenter', show); el.addEventListener('focus', show); el.addEventListener('click', show);
  }

  global.DSPLAN = function (box, p) {
    if (!p) return;
    var s = node('section', 'mn-sec pl-sec'); s.appendChild(node('h2', null, 'The plan'));
    var head = node('div', 'pl-head');
    var hero = node('div', 'ps-hero');
    hero.appendChild(node('small', null, 'Phase ' + p.phase.n + ' to ' + until(p.phase.until)));
    hero.appendChild(node('b', null, p.avg + ' a week'));
    hero.appendChild(node('span', null, (p.onTrack ? 'On target of ' : p.gap + ' short of ') + p.phase.target + ' · ' + p.phase.say));
    head.appendChild(hero);
    if (p.hire.now) head.appendChild(node('span', 'c-tag is-warn', 'Time to hire: ' + p.hire.say));
    s.appendChild(head);

    /* Surveys a week, the target as a line across; this week so far drawn open. */
    var out = node('div', 'ps-read'); out.setAttribute('aria-live', 'polite');
    var max = Math.max.apply(null, p.weeks.map(function (w) { return w.surveys; }).concat([p.phase.target, 1])) * 1.1;
    var chart = node('div', 'pl-chart');
    /* Bars are drawn 100px tall at most above their 18px labels, so the line sits on the same scale. */
    var line = node('i', 'pl-target'); line.style.bottom = (18 + Math.round(100 * p.phase.target / max)) + 'px'; chart.appendChild(line);
    p.weeks.forEach(function (w) {
      var c = node('div', 'ps-col');
      var b = node('i', w.current ? 'is-running' : w.surveys >= p.phase.target ? 'is-due' : 'is-claimed'); b.style.height = Math.max(4, Math.round(100 * w.surveys / max)) + 'px';
      mark(c, 'Week of ' + day(w.week) + ': ' + w.surveys + ' surveys' + (w.current ? ' so far' : ''), out);
      c.appendChild(b); c.appendChild(node('small', null, day(w.week))); chart.appendChild(c);
    });
    s.appendChild(chart);
    out.textContent = 'Last four weeks ' + p.avg + ' a week; target ' + p.phase.target + '. Line is the target.';
    s.appendChild(out);

    /* Each surveyor against ten a week; amber once over the hire mark. */
    var loads = node('div', 'pl-loads'), out2 = node('div', 'ps-read');
    p.loads.forEach(function (l) {
      var row = node('div', 'pl-load');
      row.appendChild(node('span', 'pl-name', l.name));
      var bar = node('div', 'ps-bar'), fill = node('i', 'ps-seg ' + (l.avg > p.hireAt ? 'is-over' : 'is-taken'));
      fill.style.width = Math.min(100, Math.round(100 * l.avg / p.perSurveyor)) + '%';
      mark(fill, l.name + ': ' + l.avg + ' a week over four weeks, ' + l.thisWeek + ' this week', out2);
      bar.appendChild(fill); row.appendChild(bar);
      row.appendChild(node('b', 'pl-num', l.avg + '/' + p.perSurveyor));
      loads.appendChild(row);
    });
    if (!p.loads.length) loads.appendChild(node('small', 'ps-none', 'No surveys yet.'));
    s.appendChild(loads);
    out2.textContent = p.loads.length + ' surveyors, room for ' + p.capacity + ' a week; the plan needs ' + p.phase.surveyors + ' this phase.';
    s.appendChild(out2);

    /* The four phases, folded. */
    var f = node('details', 'ps-all'); f.appendChild(node('summary', null, 'All four phases'));
    p.phases.forEach(function (ph) { f.appendChild(node('div', 'ps-step' + (ph.n < p.phase.n ? ' is-done' : ''), 'Phase ' + ph.n + ', to ' + until(ph.until) + ': ' + ph.target + ' a week, ' + ph.surveyors + ' surveyors. ' + ph.say)); });
    s.appendChild(f);
    box.appendChild(s);
  };
})(window);
