/* Settings: the people list, the assistant's connector address for this
   site, and whether this device has notifications on. Everything else on the
   page is links to where each setting is kept. */
(function (global) {
  'use strict';

  var U = global.DSUI;
  var el = function (id) { return document.getElementById(id); };
  var NAME = { dampscan: 'DampScan', 'ati-london': 'ATi', roofing: 'Verge', ac: 'CoolRight' };

  el('mcp-url').textContent = global.location.origin + '/api/admin/mcp';

  U.get('/api/admin/people').then(function (d) {
    var ul = el('people');
    ul.textContent = '';
    (d.people || []).forEach(function (p) {
      var held = p.businesses.map(function (b) { return (NAME[b.slug] || b.slug) + (b.level === 'manage' ? ' (manages)' : ''); }).join(', ');
      ul.appendChild(U.node('li', null, p.name + (p.isAdmin ? ', admin' : '') + ': ' + held));
    });
    if (!ul.children.length) ul.appendChild(U.node('li', null, 'Nobody yet besides the owners.'));
  }).catch(function () { el('people').textContent = 'Could not load.'; });

  U.get('/api/admin/me').then(function (me) { if (me && me.isAdmin) el('p-usage').hidden = false; }).catch(function () {});

  var on = 'Notification' in global && global.Notification.permission === 'granted';
  el('push-state').textContent = on ? 'Notifications are on for this device.' : 'Notifications are not on for this device.';
  /* Who gets the staff app alert as well as ntfy, so a missing phone shows. */
  U.get('/api/admin/push').then(function (d) {
    var list = el('push-phones'); list.textContent = '';
    (d.phones || []).forEach(function (p) { list.appendChild(U.node('li', null, p.name + ': ' + p.phones + (p.phones === 1 ? ' phone' : ' phones'))); });
    if (!list.children.length) list.appendChild(U.node('li', null, 'No phone has staff app notifications on yet. Only ntfy will buzz.'));
  }).catch(function () {});

  el('refresh').addEventListener('click', function () { global.location.reload(); });
  el('logout').addEventListener('click', async function () {
    await fetch('/api/auth/logout', { method: 'POST' });
    global.location.replace('/staff');
  });
})(window);
