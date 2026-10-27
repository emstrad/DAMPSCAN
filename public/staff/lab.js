/* The Lab: the end-of-form time picker as a customer would see it, from the
   real hours and bookings, and the survey quiz. Owners only. */
(function (global) {
  'use strict';
  var U = global.DSUI;
  var el = function (id) { return document.getElementById(id); };
  var day = function (d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }); };
  var short = function (d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); };
  var nice = function (t) { var h = Number(t.slice(0, 2)); return (h % 12 || 12) + (t.slice(3) === '00' ? '' : ':' + t.slice(3)) + (h < 12 ? 'am' : 'pm'); };

  function slots(list) {
    var box = el('slots');
    box.textContent = '';
    box.appendChild(U.node('h3', 'quiz-q', 'Thanks, we have your details. Want to pick a time now?'));
    if (!list.length) {
      box.appendChild(U.node('p', 'panel-note', 'No times to offer yet: nobody has set hours on My hours for the next three weeks. The customer would just see "We will call you to arrange a time".'));
      return;
    }
    /* As the customer sees it: the days first, then every free time on the day tapped. */
    var byDay = {};
    list.forEach(function (s) { (byDay[s.date] = byDay[s.date] || []).push(s); });
    var dayRow = U.node('div', 'quiz-options'), times = U.node('div');
    Object.keys(byDay).sort().forEach(function (d) {
      var b = U.node('button', 'quiz-opt', short(d)); b.type = 'button';
      b.addEventListener('click', function () {
        dayRow.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        times.textContent = '';
        times.appendChild(U.node('p', 'lab-day', day(d) + ': pick a time'));
        var row = U.node('div', 'quiz-options');
        byDay[d].forEach(function (s) {
          var t = U.node('button', 'quiz-opt', nice(s.time)); t.type = 'button';
          t.title = 'Would be held for ' + s.surveyor + ' (the customer does not see who)';
          row.appendChild(t);
        });
        times.appendChild(row);
      });
      dayRow.appendChild(b);
    });
    box.appendChild(dayRow);
    box.appendChild(times);
    box.appendChild(U.node('button', 'link-btn', 'No thanks, call me to arrange'));
    box.appendChild(U.node('p', 'panel-note', Object.keys(byDay).length + ' days with free times, ' + list.length + ' times in all. Tap a day to see its times; hover a time to see whose hours it comes from.'));
  }

  async function load() {
    try {
      var pc = el('lab-pc') ? el('lab-pc').value.trim() : '';
      var data = await U.get('/api/admin/hours?view=slots' + (pc ? '&postcode=' + encodeURIComponent(pc) : ''));
      slots(data.slots);
    } catch (e) { el('slots').textContent = e.message === 'unauthorised' ? '' : 'The Lab is for the owners.'; }
  }

  global.SurveyQuiz.mount(el('quiz'), { onChoose: function (r) {
    el('quiz-out').textContent = 'On the website this would open the booking form with "' + r.survey.name + '" chosen' + (r.addOns.length ? ' and ' + r.addOns.map(function (x) { return x.name.toLowerCase(); }).join(' and ') + ' noted' : '') + '.';
  } });
  var r = el('refresh'); if (r) r.addEventListener('click', load);
  if (el('lab-pc-go')) el('lab-pc-go').addEventListener('click', load);
  var o = el('logout'); if (o) o.addEventListener('click', async function () { await fetch('/api/auth/logout', { method: 'POST' }); location.replace('/staff'); });
  load();
})(window);
