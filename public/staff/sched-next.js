/* When to get back to a customer (lib/next-contact.js), on the Scheduling
   customer card: where it stands now, and the follow-up choice that goes
   with each logged call, email or text (two working days unless another is
   picked). */
(function (global) {
  'use strict';
  var U = global.DSUI;
  var CHOICES = [['2days', 'Chase in 2 days'], ['tomorrow', 'Chase tomorrow'], ['week', 'Chase next week'], ['date', 'Chase on a date'], ['none', 'No chase']];
  function day(d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); }
  function today() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }); }

  /* One select, and a date box only when "on a date" is picked. */
  function choice() {
    var sel = document.createElement('select'); sel.setAttribute('aria-label', 'When to follow up');
    CHOICES.forEach(function (c) { var o = document.createElement('option'); o.value = c[0]; o.textContent = c[1]; sel.appendChild(o); });
    var date = document.createElement('input');
    date.type = 'date'; date.min = today(); date.hidden = true; date.setAttribute('aria-label', 'Follow up on');
    sel.addEventListener('change', function () { date.hidden = sel.value !== 'date'; if (!date.hidden) date.focus(); });
    return { select: sel, date: date, value: function () { return sel.value === 'date' ? (date.value || '2days') : sel.value; } };
  }

  /* The one next step, in a line: "Reply to their email, due today" with a small Clear. */
  function status(c, act, done) {
    if (!c.next) return null;
    var due = c.next.on <= today();
    var p = U.node('div', 'scc-step ' + (due ? 'is-due' : 'is-later'));
    p.appendChild(U.node('span', null, due ? (c.next.why || 'Follow up') + ', ' + (c.next.on < today() ? 'due ' + day(c.next.on) : 'due today') : 'Next contact ' + day(c.next.on)));
    var b = U.node('button', 'scc-link', 'Clear'); b.type = 'button'; b.setAttribute('aria-label', 'No follow-up needed');
    b.addEventListener('click', function () { act({ op: 'next', kind: c.kind, id: c.id, next: 'none' }, 'No follow-up for ' + (c.name || 'them') + '.').then(done); });
    p.appendChild(b);
    return p;
  }

  global.DSSCHEDNEXT = { choice: choice, status: status };
})(window);
