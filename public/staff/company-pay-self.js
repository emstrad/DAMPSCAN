/* Pay, Paying yourselves (the owner, 20 Nov 2026): Scott's and Tom's tax year
   (salary, dividends, what is left at 10.75% and what to take now), mileage to
   claim from the routes driven, the seven steps ticked from the books, and the
   dates to act on. Figures from lib/pay-self.js; a claim is recorded as a cost
   on Money (so the bank check matches its transfer). */
(function (global) {
  'use strict';
  var U = global.DSUI, node = U.node;
  var money = function (p) { var n = Number(p) || 0; return (n < 0 ? '−' : '') + '£' + (Math.abs(n) / 100).toLocaleString('en-GB', { minimumFractionDigits: Math.abs(n) % 100 ? 2 : 0, maximumFractionDigits: 2 }); };
  var day = function (d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };
  var monthName = function (m) { return new Date(m + '-15T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }); };
  var monthEnd = function (m) { var d = new Date(m + '-15T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10); };
  /* The same as lib/mileage.js claimPence: 45p a mile, 25p after 10,000 in the tax year. */
  var claim = function (miles, before) { var a = Math.max(0, Math.min(miles, 10000 - before)); return a * 45 + (miles - a) * 25; };
  var loaded = false;

  (global.DSCOTABS = global.DSCOTABS || {}).pay = function () { if (!loaded) load(); };

  function row(label, sub, figure, cls) {
    var r = node('div', 'c-row' + (cls ? ' ' + cls : ''));
    var l = node('span', 'c-l'); l.appendChild(node('b', null, label)); if (sub) l.appendChild(node('small', null, sub));
    var rt = node('span', 'c-r'); if (figure != null) rt.appendChild(figure.nodeType ? figure : node('span', 'c-amt', figure));
    r.appendChild(l); r.appendChild(rt); return r;
  }
  function fold(box, title, sub, fill, open) {
    var d = node('details', 'pay-surveys'); if (open) d.open = true;
    var s = node('summary', 'c-row'); var l = node('span', 'c-l'); l.appendChild(node('b', null, title)); if (sub) l.appendChild(node('small', null, sub));
    var r = node('span', 'c-r'); r.appendChild(node('span', 'c-chev', '›')); s.appendChild(l); s.appendChild(r); d.appendChild(s);
    var inner = node('div', 'c-rows'); fill(inner); d.appendChild(inner); box.appendChild(d);
  }
  async function record(btn, body) {
    btn.disabled = true; var was = btn.textContent; btn.textContent = '...';
    var r = await U.send('/api/admin/pay', body).catch(function () { return { ok: false }; });
    if (!r.ok) { btn.disabled = false; btn.textContent = was; global.alert((r.data && r.data.error) || 'Not saved.'); return; }
    loaded = false; load();
  }

  async function load() {
    var box = document.getElementById('pay-self'); if (!box) return;
    var d; try { d = await U.get('/api/admin/pay?view=self'); } catch (e) { return; }
    loaded = true; box.textContent = '';
    box.appendChild(node('h2', 'pay-self-h', 'Paying yourselves, tax year ' + d.taxYear.label));

    /* Each director: the dividend to take now at 10.75%, the band left, what is in so far. */
    var people = node('div', 'c-rows');
    d.people.forEach(function (p) {
      var sub = 'Salary ' + money(p.salary) + ' · dividends ' + money(p.dividends) + ' · ' + money(p.room) + ' left at 10.75%' + (p.over ? ' · ' + money(p.over) + ' over' : '') + (p.tax ? ' · tax so far ' + money(p.tax) : '');
      people.appendChild(row(p.name + ': take now', sub, money(p.takeNow), p.over ? 'is-bad' : ''));
    });
    box.appendChild(people);
    /* Take now: the least of the band left, what Pay says is owed, and what the company can pay from profit after tax. */
    box.appendChild(node('p', 'mn-say', 'Company can pay ' + money(d.headroom) + '. Assumes no other income.'));

    /* Mileage: each month driven and not yet claimed, miles typed over if need be, then Record. */
    d.people.forEach(function (p) {
      var m = p.mileage, open = m.toClaim.length;
      fold(box, p.name + "'s mileage", m.miles + ' miles this tax year' + (m.home ? ' from ' + m.home : ', no home area set') + ' · ' + money(m.claimedPence) + ' claimed', function (f) {
        if (!m.months.length) f.appendChild(row('No surveys driven yet', null, null));
        m.months.forEach(function (x) {
          if (x.claimed) { f.appendChild(row(monthName(x.month), x.claimed.miles + ' miles', money(x.claimed.pence), 'is-done')); return; }
          var input = document.createElement('input'); input.type = 'number'; input.min = '1'; input.inputMode = 'numeric'; input.value = String(x.miles); input.className = 'pay-miles'; input.setAttribute('aria-label', 'Miles in ' + monthName(x.month));
          var amt = node('b', 'c-amt', money(x.pence));
          input.addEventListener('input', function () { amt.textContent = money(claim(Math.max(0, Math.round(Number(input.value) || 0)), x.before)); });
          var r = row(monthName(x.month), x.days + ' survey day' + (x.days === 1 ? '' : 's') + (x.open ? '' : ' · month not over'), amt);
          var act = node('div', 'pay-claim'); act.appendChild(input);
          if (x.open) {
            var b = node('button', 'btn btn--ghost', 'Record claim'); b.type = 'button';
            b.addEventListener('click', function () { var miles = Math.round(Number(input.value) || 0); if (!(miles > 0)) { input.focus(); return; } record(b, { op: 'expense', pence: claim(miles, x.before), day: monthEnd(x.month), category: 'Mileage', what: p.name + ' ' + x.month + ': ' + miles + ' miles' }); });
            act.appendChild(b);
          }
          f.appendChild(r); f.appendChild(act);
        });
      }, open);
    });

    /* The seven steps, each ticked from the books where it can be. */
    var doneN = d.steps.filter(function (s) { return s.done; }).length;
    fold(box, 'The seven steps', doneN + ' of ' + d.steps.filter(function (s) { return s.done !== null; }).length + ' done', function (f) {
      d.steps.forEach(function (s) {
        var tag = node('span', 'c-tag ' + (s.done ? 'is-good' : s.done === false ? 'is-warn' : ''), s.done ? 'Done' : s.done === false ? 'To do' : 'Keep doing');
        f.appendChild(row(s.n + '. ' + s.title, s.say, tag));
        if (s.n === 4 && !s.done) {
          var act = node('div', 'pay-claim');
          d.people.forEach(function (p) {
            var b = node('button', 'btn btn--ghost', 'Claim ' + money(d.rates.homeMonth) + ' for ' + p.name); b.type = 'button';
            b.addEventListener('click', function () { record(b, { op: 'expense', pence: d.rates.homeMonth, day: d.today, category: 'Use of home', what: p.name + ' ' + d.today.slice(0, 7) }); });
            act.appendChild(b);
          });
          f.appendChild(act);
        }
      });
    }, false);

    /* The dates to act on. */
    fold(box, 'Dates to act on', d.milestones.length ? 'Next: ' + d.milestones[0].what + ', ' + day(d.milestones[0].day) : null, function (f) {
      d.milestones.forEach(function (x) { f.appendChild(row(x.what, x.say, day(x.day), x.days <= 14 ? 'is-bad' : '')); });
    }, false);
  }
})(window);
