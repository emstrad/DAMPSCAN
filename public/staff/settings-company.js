/* Settings, Company details (owners only; lib/company-details.js): the
   company's own facts for the owners and ChatGPT. The server refuses
   anything that reads like a password, PIN or security answer. */
(function (global) {
  'use strict';
  var U = global.DSUI;
  var el = function (id) { return document.getElementById(id); };

  function draw(d) {
    var f = el('co-form');
    f.textContent = '';
    d.fields.forEach(function (x) {
      var lab = U.node('label', 'field');
      lab.appendChild(U.node('span', null, x.label));
      var inp = document.createElement(x.key === 'notes' || x.key === 'registered_office' ? 'textarea' : 'input');
      inp.name = x.key; inp.value = x.value || ''; inp.autocomplete = 'off';
      if (inp.tagName === 'TEXTAREA') inp.rows = 2;
      lab.appendChild(inp);
      lab.appendChild(U.node('small', 'field-error', ''));
      f.appendChild(lab);
    });
    var go = U.node('button', 'btn btn--primary btn--sm', 'Save'); go.type = 'submit';
    var note = U.node('p', 'panel-note', d.updatedAt ? 'Last saved ' + new Date(d.updatedAt).toLocaleDateString('en-GB') + '.' : '');
    f.appendChild(go); f.appendChild(note);
  }

  el('co-form').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var values = {};
    Array.prototype.forEach.call(this.elements, function (x) { if (x.name) values[x.name] = x.value; });
    var r;
    try { r = await U.send('/api/admin/business', { op: 'company', values: values }); } catch (e) { r = { ok: false, data: null }; }
    if (r.ok) { draw(r.data); this.querySelector('.panel-note').textContent = 'Saved.'; return; }
    var errs = (r.data && r.data.errors) || {};
    Array.prototype.forEach.call(this.querySelectorAll('label'), function (l) {
      var name = l.querySelector('input,textarea').name;
      l.querySelector('.field-error').textContent = errs[name] || '';
    });
    if (!Object.keys(errs).length) this.querySelector('.panel-note').textContent = 'Not saved. Try again.';
  });

  /* A place on this page (opening its fold), another staff page, or Vercel and GitHub in a new tab. */
  function goTo(go) {
    var a = U.node('a', 'ready-link'); a.href = go;
    if (/^https?:/.test(go)) { a.target = '_blank'; a.rel = 'noopener'; return a; }
    if (go.charAt(0) === '#') a.addEventListener('click', function (e) {
      var to = document.querySelector(go); if (!to) return;
      e.preventDefault();
      var fold = to.tagName === 'DETAILS' ? to : to.querySelector('details'); if (fold) fold.open = true;
      to.scrollIntoView({ block: 'start' });
    });
    return a;
  }
  function line(i) {
    var li = U.node('li', 'is-' + i.state);
    var to = i.state !== 'ok' && i.go ? goTo(i.go) : null;
    var row = to || li;
    row.appendChild(U.node('b', null, MARK[i.state]));
    var tx = U.node('span', null, i.label);
    if (i.note) tx.appendChild(U.node('small', null, i.note));
    row.appendChild(tx);
    if (to) { to.appendChild(U.node('i', 'ready-go', '\u203A')); li.appendChild(to); }
    return li;
  }

  /* Left to set up: only what still needs doing (worth a look first), each tapping
     through to its fix; everything done folded beneath. Gone once all is done. */
  var MARK = { ok: '\u2713', todo: '\u2717', warn: '!' };
  function ready() {
    U.get('/api/admin/business?view=ready').then(function (d) {
      var all = [].concat.apply([], d.groups.map(function (g) { return g.items; }));
      var left = all.filter(function (i) { return i.state !== 'ok'; }).sort(function (x, y) { return (x.state === 'todo') - (y.state === 'todo'); });
      var done = all.filter(function (i) { return i.state === 'ok'; });
      el('p-ready').hidden = !left.length;
      var todo = el('ready-todo'); todo.textContent = '';
      left.forEach(function (i) { todo.appendChild(line(i)); });
      var box = el('ready-done'); box.textContent = '';
      done.forEach(function (i) { box.appendChild(line(i)); });
      el('ready-done-sum').textContent = done.length + ' already set up';
      el('ready-done-fold').hidden = !done.length;
    }).catch(function () {});
  }
  ready();
  document.addEventListener('ds:ready', ready);

  U.get('/api/admin/business?view=company').then(function (d) { el('p-co').hidden = false; draw(d); }).catch(function () {});
  /* Saving the company's details can tick items off the list above. */
  el('co-form').addEventListener('submit', function () { setTimeout(ready, 1200); });
})(window);
