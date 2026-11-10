/* When to get back to a customer (lib/next-contact.js), on the Scheduling
   customer card: where it stands now, and the chips that go with each logged
   call, email or text (two working days unless another is picked). */
(function (global) {
  'use strict';
  var U = global.DSUI;
  var CHIPS = [['tomorrow', 'Tomorrow'], ['2days', '2 days'], ['week', 'Next week'], ['none', 'No follow-up']];
  function day(d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); }
  function today() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }); }

  /* The chip row: one picked at a time, or a date of their own. */
  function chips() {
    var box = U.node('div', 'scc-next');
    box.appendChild(U.node('span', 'meta', 'Next contact'));
    var picked = '2days';
    var date = document.createElement('input');
    date.type = 'date'; date.min = today(); date.setAttribute('aria-label', 'Next contact on a date');
    var pills = CHIPS.map(function (c) {
      var b = U.node('button', 'pill', c[1]); b.type = 'button';
      b.setAttribute('aria-pressed', c[0] === picked ? 'true' : 'false');
      b.addEventListener('click', function () { picked = c[0]; date.value = ''; pills.forEach(function (p) { p.setAttribute('aria-pressed', p === b ? 'true' : 'false'); }); });
      box.appendChild(b); return b;
    });
    date.addEventListener('change', function () { if (date.value) { picked = date.value; pills.forEach(function (p) { p.setAttribute('aria-pressed', 'false'); }); } });
    box.appendChild(date);
    return { node: box, value: function () { return picked; } };
  }

  /* "Reply to their email, due today" or "Next contact Thu 12 Nov", with a way to drop it. */
  function status(c, act, done) {
    if (!c.next) return null;
    var due = c.next.on <= today();
    var p = U.node('p', due ? 'sheet-next' : 'meta', (c.next.why || 'Follow up') + ': ' + (due ? (c.next.on < today() ? 'due ' + day(c.next.on) : 'due today') : day(c.next.on)) + ' ');
    var b = U.node('button', 'btn btn--ghost btn--sm', 'No follow-up'); b.type = 'button';
    b.addEventListener('click', function () { act({ op: 'next', kind: c.kind, id: c.id, next: 'none' }, 'No follow-up for ' + (c.name || 'them') + '.').then(done); });
    p.appendChild(b);
    return p;
  }

  global.DSSCHEDNEXT = { chips: chips, status: status };
})(window);
