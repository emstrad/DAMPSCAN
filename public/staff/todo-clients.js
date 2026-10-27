/* "Customers who need something", on the to-do page: everything outstanding
   (lib/work.js, the same list as Today and the assistant read) gathered by
   customer, so one card says all that is owed to or wanted from them: an
   enquiry to call, a deposit, a balance, a report, a quote with no answer.
   Each card has Call and Open. To-dos themselves stay in the list below. */
(function (global) {
  'use strict';
  var U = global.DSUI;
  var NAMES = { dampscan: 'DampScan', 'ati-london': 'ATi', roofing: 'Verge Roofing', ac: 'CoolRight' };

  function open(i) {
    if (!i.jobId) { location.href = '/staff/' + ((i.site === 'dampscan' || i.site === 'ati-london') ? 'schedule.html#lead-' + i.id : 'dashboard.html'); return; }
    if (global.DSPOP) global.DSPOP.open(i.jobId, { onChange: function () { render(document.getElementById('clients')); } });
  }

  async function render(mount) {
    try {
      var today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
      var d = await U.get('/api/admin/calendar?view=work&from=' + today + '&to=' + today);
      var byWho = new Map();
      ((d.work && d.work.groups) || []).forEach(function (g) {
        if (g.key === 'todos' || g.key === 'payouts' || g.key === 'budget') return;
        g.items.forEach(function (i) {
          var key = i.jobId ? 'job-' + i.jobId : 'lead-' + i.id;
          if (!byWho.has(key)) byWho.set(key, { first: i, things: [] });
          var c = byWho.get(key);
          c.things.push({ what: i.what, overdue: i.overdue });
          if (i.phone && !c.first.phone) c.first.phone = i.phone;
        });
      });
      mount.textContent = '';
      var list = Array.from(byWho.values()).sort(function (a, b) {
        return (b.things.some(function (t) { return t.overdue; }) ? 1 : 0) - (a.things.some(function (t) { return t.overdue; }) ? 1 : 0) || b.things.length - a.things.length;
      });
      document.getElementById('clients-count').textContent = list.length ? '(' + list.length + ')' : '';
      if (!list.length) { mount.appendChild(U.node('li', 'panel-note', 'Nobody needs anything right now.')); return; }
      list.forEach(function (c) {
        var i = c.first;
        var li = U.node('li', 'tc-card' + (c.things.some(function (t) { return t.overdue; }) ? ' is-late' : ''));
        li.appendChild(U.node('strong', null, (i.firstName || 'No name') + (i.postcode ? ', ' + i.postcode : '')));
        li.appendChild(U.node('span', 'tc-biz', NAMES[i.site] || ''));
        var ul = U.node('ul', 'tc-things');
        c.things.forEach(function (t) { ul.appendChild(U.node('li', t.overdue ? 'tl-clash' : null, t.what)); });
        li.appendChild(ul);
        var row = U.node('div', 'tc-row');
        if (i.phone) { var a = U.node('a', 'btn btn--ghost btn--sm', 'Call'); a.href = 'tel:' + String(i.phone).replace(/[^\d+]/g, ''); row.appendChild(a); }
        var b = U.node('button', 'btn btn--sm', 'Open'); b.type = 'button'; b.addEventListener('click', function () { open(i); }); row.appendChild(b);
        li.appendChild(row);
        mount.appendChild(li);
      });
    } catch (e) { if (e.message !== 'unauthorised') mount.textContent = 'Could not load customers.'; }
  }
  global.DSTODOCLIENTS = { render: render };
  render(document.getElementById('clients'));
})(window);
