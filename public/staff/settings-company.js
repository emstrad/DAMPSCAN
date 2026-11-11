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

  /* Ready to switch on: each group folds, open while it has something left to do. */
  var MARK = { ok: '✓', todo: '✗', warn: '!' };
  U.get('/api/admin/business?view=ready').then(function (d) {
    el('p-ready').hidden = false;
    el('ready-sum').textContent = d.left ? d.left + ' thing' + (d.left === 1 ? '' : 's') + ' left to set up' : 'Everything is set up.';
    var box = el('ready-list');
    box.textContent = '';
    d.groups.forEach(function (g) {
      var f = document.createElement('details'); f.className = 'sheet-fold';
      f.open = g.done < g.of;
      f.appendChild(U.node('summary', null, g.title + ' (' + g.done + ' of ' + g.of + ')'));
      var ul = U.node('ul', 'ready-list');
      g.items.forEach(function (i) {
        var li = U.node('li', 'is-' + i.state);
        li.appendChild(U.node('b', null, MARK[i.state]));
        var tx = U.node('span', null, i.label);
        if (i.note) tx.appendChild(U.node('small', null, i.note));
        li.appendChild(tx);
        ul.appendChild(li);
      });
      f.appendChild(ul);
      box.appendChild(f);
    });
  }).catch(function () {});

  U.get('/api/admin/business?view=company').then(function (d) { el('p-co').hidden = false; draw(d); }).catch(function () {});
})(window);
