/* "+ New customer" on Scheduling: someone rings, and they are a card on the
   board in seconds (lib/sched-create.js), then their card opens with the
   times to offer. Also the booking form's Today and Tomorrow buttons and the
   "Set their hours" link a clash about missing hours offers. */
(function (global) {
  'use strict';
  var U = global.DSUI;
  var el = function (id) { return document.getElementById(id); };
  var dlg = el('newc');
  var force = false;
  function iso(n) { var d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' }); }

  el('newc-open').addEventListener('click', function () { el('newc-form').reset(); el('newc-note').textContent = ''; force = false; dlg.showModal(); el('nc-name').focus(); });
  el('newc-cancel').addEventListener('click', function () { dlg.close(); });
  el('newc-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var body = { op: 'create', force: force };
    ['site', 'name', 'phone', 'email', 'postcode', 'address', 'note'].forEach(function (k) { body[k] = el('nc-' + k).value; });
    var r = await U.send('/api/admin/scheduling', body);
    if (!r.ok) { el('newc-note').textContent = (r.data && r.data.error) || 'That did not save.'; return; }
    if (r.data.same) {
      var s = r.data.same;
      el('newc-note').textContent = (s.name || 'Someone') + (s.postcode ? ', ' + s.postcode : '') + ' is already on the board with that number or email. Tap Add again if this is someone else, or Cancel and search for them.';
      force = true; return;
    }
    dlg.close();
    global.dispatchEvent(new CustomEvent('sched:made', { detail: { kind: r.data.kind, id: r.data.id } }));
  });

  el('b-today').addEventListener('click', function () { el('b-date').value = iso(0); el('b-date').dispatchEvent(new Event('change')); });
  el('b-tomorrow').addEventListener('click', function () { el('b-date').value = iso(1); el('b-date').dispatchEvent(new Event('change')); });
  /* A clash about hours offers to set them, for whoever is picked. */
  global.DSSCHEDNEW = {
    clash: function (text) {
      var a = el('b-hours');
      a.hidden = !/set hours|My hours/.test(text || '');
      a.href = '/staff/hours.html?area=damp&surveyor=' + el('b-who').value;
      a.textContent = 'Set ' + el('b-who').selectedOptions[0].textContent + "'s hours";
    }
  };
})(window);
