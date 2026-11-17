/* Who gets what, in the job pop-up (the owner, 17 Nov 2026): this survey's
   split as each person ends up with it, and a set amount moved from one person
   to another when the waterfall is not how it was really shared (Scott and Tom
   both went). The new figures show before Move is pressed; every move is a
   line with its reason and Take back. Owners only: the server refuses anyone
   else, and then the line goes. Figures from lib/pay-moves.js. */
(function (global) {
  'use strict';
  var U = global.DSUI;
  var NAMES = { tax: 'Tax set aside', scott: 'Scott', tom: 'Tom', ben: 'Ben', ronnie: 'Ronnie' };
  var WHO = ['scott', 'tom', 'ben', 'ronnie'];
  var gbp = function (p) { return '£' + (p / 100).toFixed(2); };
  var day = function (at) { return new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' }); };

  function sumUp(group, s) {
    var sub = group.querySelector('summary small'), tag = group.querySelector('summary .c-tag');
    if (sub) sub.textContent = s.people.filter(function (p) { return p.key !== 'tax' && p.now; }).map(function (p) { return p.name + ' ' + gbp(p.now); }).join(' · ');
    if (s.moves.length && !tag) group.querySelector('summary').appendChild(U.node('span', 'c-tag is-info', 'Changed'));
    if (!s.moves.length && tag) tag.remove();
  }

  function draw(group, box, s, jobId) {
    box.textContent = '';
    sumUp(group, s);
    var rows = U.node('div', 'c-rows sp-people');
    s.people.forEach(function (p) {
      var r = U.node('div', 'sp-person' + (p.now !== p.was ? ' is-moved' : ''));
      r.appendChild(U.node('span', null, NAMES[p.key]));
      var right = U.node('span', 'sp-amt');
      if (p.now !== p.was) right.appendChild(U.node('s', null, gbp(p.was)));
      right.appendChild(U.node('b', null, gbp(p.now)));
      r.appendChild(right); rows.appendChild(r);
    });
    box.appendChild(rows);

    s.moves.forEach(function (m) {
      var r = U.node('div', 'sp-move');
      var l = U.node('div', 'c-l');
      l.appendChild(U.node('b', null, gbp(m.pence) + ' from ' + NAMES[m.from] + ' to ' + NAMES[m.to]));
      l.appendChild(U.node('small', null, [m.reason, m.by, day(m.at)].filter(Boolean).join(' · ')));
      var back = U.node('button', 'btn btn--ghost btn--sm sp-back', 'Take back'); back.type = 'button';
      back.addEventListener('click', async function () {
        back.disabled = true;
        var x; try { x = await U.send('/api/admin/pay', { op: 'unmove', id: m.id }); } catch (e) { x = { ok: false }; }
        if (!x.ok) { back.disabled = false; err.textContent = (x.data && x.data.error) || 'Not taken back. Try again.'; return; }
        draw(group, box, x.data.split, jobId);
      });
      r.appendChild(l); r.appendChild(back); box.appendChild(r);
    });

    /* Move money: an amount, from, to and why, with the result shown before it is saved. */
    var f = U.node('form', 'sp-form');
    f.appendChild(U.node('span', 'c-label', 'Move money'));
    var amt = document.createElement('input'); amt.type = 'text'; amt.inputMode = 'decimal'; amt.placeholder = '£ amount'; amt.setAttribute('aria-label', 'Amount in pounds');
    var pick = function (label, keys, start) {
      var sel = document.createElement('select'); sel.setAttribute('aria-label', label);
      keys.forEach(function (k) { var o = document.createElement('option'); o.value = k; o.textContent = label + ' ' + NAMES[k]; sel.appendChild(o); });
      sel.value = start; return sel;
    };
    var have = function (k) { return (s.people.filter(function (p) { return p.key === k; })[0] || { now: 0 }).now; };
    var givers = WHO.filter(function (k) { return have(k) > 0; });
    if (!givers.length) return;
    var from = pick('From', givers, givers.indexOf('ben') !== -1 ? 'ben' : givers[0]);
    var to = pick('To', WHO, from.value === 'scott' ? 'tom' : 'scott');
    var why = document.createElement('input'); why.type = 'text'; why.maxLength = 200; why.placeholder = 'Why, e.g. Scott and Tom both went'; why.setAttribute('aria-label', 'Why');
    var line = U.node('div', 'sp-pair'); line.appendChild(from); line.appendChild(to);
    var preview = U.node('p', 'sp-preview'), err = U.node('p', 'sp-err');
    var go = U.node('button', 'btn sp-go', 'Move'); go.type = 'submit';
    [amt, line, why, preview, go, err].forEach(function (x) { f.appendChild(x); });
    var pence = function () { var v = Math.round(parseFloat(String(amt.value).replace(/[£,\s]/g, '')) * 100); return v > 0 ? v : 0; };
    var update = function () {
      var p = pence(), a = from.value, b = to.value;
      err.textContent = ''; preview.textContent = '';
      go.disabled = !p || a === b || !why.value.trim() || p > have(a);
      go.textContent = p ? 'Move ' + gbp(p) : 'Move';
      if (a === b) { err.textContent = 'Pick two different people.'; return; }
      if (p > have(a)) { err.textContent = NAMES[a] + ' has ' + gbp(have(a)) + ' on this survey.'; return; }
      if (p) preview.textContent = NAMES[a] + ' ' + gbp(have(a)) + ' → ' + gbp(have(a) - p) + ' · ' + NAMES[b] + ' ' + gbp(have(b)) + ' → ' + gbp(have(b) + p);
    };
    [amt, from, to, why].forEach(function (x) { x.addEventListener('input', update); x.addEventListener('change', update); });
    f.addEventListener('submit', async function (e) {
      e.preventDefault(); update(); if (go.disabled) return;
      go.disabled = true;
      var x; try { x = await U.send('/api/admin/pay', { op: 'move', jobId: jobId, from: from.value, to: to.value, pence: pence(), reason: why.value }); } catch (er) { x = { ok: false }; }
      if (!x.ok) { go.disabled = false; err.textContent = (x.data && x.data.error) || 'Not moved. Try again.'; return; }
      draw(group, box, x.data.split, jobId);
    });
    update();
    box.appendChild(f);
  }

  async function render(group, j) {
    var box = U.node('div', 'sp'); group.appendChild(box);
    var s; try { s = await U.get('/api/admin/pay?job=' + j.id); } catch (e) { group.remove(); return; }
    if (!s || !s.people) { group.remove(); return; }
    draw(group, box, s, j.id);
  }

  global.DSPOPSPLIT = { render: render };
})(window);
