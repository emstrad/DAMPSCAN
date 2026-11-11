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

  U.get('/api/admin/business?view=company').then(function (d) { el('p-co').hidden = false; draw(d); }).catch(function () {});
})(window);
