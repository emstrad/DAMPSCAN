/* The "Action needed" list on the Calendar: every outstanding thing, grouped
   and counted, each with the one-tap actions that clear it right where it
   sits. The list comes from the server (lib/work.js, the same list the
   assistant reads), and every action posts to the route the rest of the
   staff area already uses for it, so a tick here is the same tick as on the
   client card or the job screen. After an action the item leaves the list
   at once and the page refreshes its counts in the background. */
(function (global) {
  'use strict';

  var U = global.DSUI;
  var NAME = { dampscan: 'DampScan', 'ati-london': 'ATi', roofing: 'Verge', ac: 'CoolRight' };
  var AREA_OF = { dampscan: 'damp', 'ati-london': 'damp', roofing: 'roofing', ac: 'ac' };

  function jobHref(site, id, quoted) {
    if (!id) return null;
    return quoted || site === 'roofing' || site === 'ac' ? '/staff/quoted.html?area=' + AREA_OF[site] + '#job-' + id : '/staff/surveys.html?area=damp#job-' + id;
  }

  function shortDate(iso) {
    return iso ? new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : '';
  }

  function linkBtn(text, href, cls) {
    var a = document.createElement('a');
    a.className = 'pill act ' + (cls || '');
    a.href = href;
    a.textContent = text;
    if (/^https:/.test(href)) { a.target = '_blank'; a.rel = 'noopener'; }
    return a;
  }

  function button(text, onClick, cls) {
    var b = U.node('button', 'pill act ' + (cls || ''), text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  /* After a one-tap action, five seconds to take it back: the toast's Undo
     sends the opposite through the same route, so nothing needs an "are you
     sure" first. One toast at a time; a new action replaces the last. */
  var toast = null;
  function offerUndo(words, undo, done) {
    if (toast) toast.remove();
    toast = U.node('div', 'undo-toast');
    toast.setAttribute('role', 'status');
    toast.appendChild(U.node('span', null, words));
    var box = toast;
    var timer = setTimeout(function () { box.remove(); }, 5000);
    var b = U.node('button', null, 'Undo');
    b.type = 'button';
    b.addEventListener('click', async function () {
      clearTimeout(timer);
      box.remove();
      try { await undo(); } catch (e) { /* the refresh shows the truth either way */ }
      if (done) done();
    });
    toast.appendChild(b);
    /* Inside an open dialog it must sit in the dialog, the top layer, or the
       backdrop would cover it and Undo could not be tapped. */
    (document.querySelector('dialog[open]') || document.body).appendChild(toast);
  }

  /* One write, then the item goes. A refused write puts the reason on the
     item rather than in an alert, which a phone shows as a page-wide popup.
     `reverse` is the body that undoes it, when there is one. */
  async function act(row, path, body, done, reverse, words) {
    row.classList.add('is-busy');
    try {
      var r = await U.send(path, body);
      if (!r.ok) throw new Error((r.data && (r.data.message || r.data.error || JSON.stringify(r.data.errors || {}))) || 'Not saved');
      row.classList.add('is-done');
      if (reverse) offerUndo(words || 'Done.', function () { return U.send(reverse.path || path, reverse.body, reverse.method); }, done);
      setTimeout(function () { row.remove(); if (done) done(); }, 250);
    } catch (e) {
      row.classList.remove('is-busy');
      var note = row.querySelector('.act-err') || row.appendChild(U.node('p', 'act-err'));
      note.textContent = e.message || 'Not saved';
    }
  }

  /* A small date and time picker inside the item, for "set a date". */
  function datePicker(row, it, onDone) {
    var form = U.node('form', 'act-date');
    var d = document.createElement('input'); d.type = 'date'; d.required = true; d.value = it.date || ''; d.setAttribute('aria-label', 'Date');
    var t = document.createElement('input'); t.type = 'time'; t.value = it.time || ''; t.setAttribute('aria-label', 'Time');
    form.appendChild(d); form.appendChild(t);
    form.appendChild(button('Save', function () {}, 'act-main'));
    form.lastChild.type = 'submit';
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var path = '/api/admin/' + (it.quoted ? 'quoted' : 'clients');
      act(row, path, moveBody(it, d.value, t.value), onDone, it.date ? { body: moveBody(it, it.date, it.time) } : null, 'Date set.');
    });
    return form;
  }

  /* The quoted trades move a date through the board's status change, keeping
     the stage; a damp survey through its client card, which also clears an
     estate agent wait when a time arrives. */
  function moveBody(it, date, time) {
    if (!it.quoted) return { id: it.jobId || it.id, jobDate: date, jobTime: time || undefined };
    return { op: 'status', id: it.jobId || it.id, status: it.status === 'quoted' ? 'booked' : (it.status || 'booked'), jobDate: date, jobTime: time || undefined };
  }

  function actionsRow(row, it, onDone) {
    var bar = U.node('div', 'act-bar');
    var add = function (n) { if (n) bar.appendChild(n); };
    it.actions.forEach(function (a) {
      if (a === 'open') add(it.jobId ? linkBtn('Open', jobHref(it.site, it.jobId, it.quoted)) : it.leadId ? linkBtn('Open', '/staff/schedule.html?area=damp#lead-' + it.leadId) : null);
      if (a === 'leads') add(linkBtn('Open', '/staff/dashboard.html?area=' + AREA_OF[it.site]));
      if (a === 'call' && it.phone) {
        add(linkBtn('Call', 'tel:' + String(it.phone).replace(/[^\d+]/g, '')));
        if (it.whatsapp) add(linkBtn('WhatsApp', it.whatsapp, 'msg-whatsapp'));
      }
      if (a === 'deposit') add(button('Deposit paid', function () { act(row, '/api/admin/clients', { id: it.jobId, depositPaid: true }, onDone, { body: { id: it.jobId, depositPaid: false } }, 'Deposit marked paid.'); }, 'act-main'));
      if (a === 'paid') add(button('Paid in full', function () { act(row, '/api/admin/clients', { id: it.jobId, paid: true }, onDone, { body: { id: it.jobId, paid: false } }, 'Marked paid in full.'); }));
      if (a === 'report') add(button('Report sent', function () { act(row, '/api/admin/clients', { id: it.jobId, surveySent: true }, onDone, { body: { id: it.jobId, surveySent: false } }, 'Report marked sent.'); }, 'act-main'));
      if (a === 'remedial') {
        add(button('Quoting', function () { act(row, '/api/admin/surveys', { op: 'remedial', id: it.jobId, status: 'quoting' }, onDone, { body: { op: 'remedial', id: it.jobId, status: 'none' } }, 'Marked quoting.'); }, 'act-main'));
        add(button('Not wanted', function () { act(row, '/api/admin/surveys', { op: 'remedial', id: it.jobId, status: 'declined' }, onDone, { body: { op: 'remedial', id: it.jobId, status: 'none' } }, 'Marked not wanted.'); }));
      }
      if (a === 'todo') add(button('Done', function () { act(row, '/api/admin/todos', { op: 'done', id: it.id }, onDone, { body: { op: 'reopen', id: it.id } }, 'To-do ticked off.'); }, 'act-main'));
      if (a === 'contacted') add(button('Reminded', function () { act(row, '/api/admin/contracts', { op: 'contacted', id: it.id }, onDone, { body: { op: 'uncontacted', id: it.id, on: it.lastContactedOn || '' } }, 'Marked reminded.'); }));
      if (a === 'date') add(button('Set date', function () {
        var open = row.querySelector('.act-date');
        if (open) { open.remove(); return; }
        row.appendChild(datePicker(row, it, onDone));
        row.querySelector('.act-date input').focus();
      }));
    });
    /* Snooze takes the item off my Today until tomorrow or next Monday. */
    add(button('Snooze', function () {
      var open = row.querySelector('.snooze-pick');
      if (open) { open.remove(); return; }
      var pick = U.node('div', 'snooze-pick');
      var snooze = function (until, words) {
        act(row, '/api/admin/snooze', { kind: it.group, ref: String(it.id), until: until }, onDone,
          { method: 'DELETE', body: { kind: it.group, ref: String(it.id) } }, words);
      };
      pick.appendChild(button('Tomorrow', function () { snooze(dayAfter(1), 'Snoozed till tomorrow.'); }));
      pick.appendChild(button('Next week', function () { snooze(nextMonday(), 'Snoozed till next week.'); }));
      row.appendChild(pick);
    }, 'act-snooze'));
    return bar;
  }

  var londonToday = function () { return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }); };
  function dayAfter(n, from) { var d = new Date((from || londonToday()) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function nextMonday() { var t = londonToday(); var dow = new Date(t + 'T12:00:00Z').getUTCDay(); return dayAfter(((8 - dow) % 7) || 7, t); }

  function itemRow(it, onDone) {
    var row = U.node('li', 'act-item ev--' + it.site + (it.overdue ? ' is-overdue' : ''));
    var head = U.node('div', 'act-head');
    var who = it.group === 'todos' && !it.firstName ? 'To-do' + (it.forName ? ' for ' + it.forName : '') : [it.firstName || 'No name', it.postcode].filter(Boolean).join(', ');
    head.appendChild(U.node('span', 'act-who', who));
    head.appendChild(U.node('span', 'act-biz', NAME[it.site] || (it.forName ? 'For ' + it.forName : 'General')));
    row.appendChild(head);
    var what = it.what + (it.owedPence ? ' (' + U.money(it.owedPence) + ')' : '') + (it.date && it.group !== 'enquiries' ? ' · ' + shortDate(it.date) + (it.time ? ' ' + it.time : '') : '');
    row.appendChild(U.node('p', 'act-what', what));
    /* A message is its words plus the WhatsApp, text and email links; tapping
       one records it as sent (messages.js) and the item can go. */
    if (it.message && it.actions.indexOf('message') !== -1) {
      row.appendChild(global.DSMSG.buttons(it.jobId, it.message, function () { row.remove(); if (onDone) onDone(); }));
    }
    row.appendChild(actionsRow(row, it, onDone));
    return row;
  }

  /** The grouped list into `mount`; `onDone` runs after any item is cleared. */
  function render(mount, work, onDone, filter) {
    mount.textContent = '';
    var groups = (work && work.groups) || [];
    if (filter) groups = groups.map(function (g) { var items = g.items.filter(filter); return { key: g.key, label: g.label, items: items, count: items.length }; }).filter(function (g) { return g.count; });
    if (!groups.length) { mount.appendChild(U.node('p', 'panel-note', 'Nothing outstanding. Well done.')); return; }
    groups.forEach(function (g, i) {
      var box = document.createElement('details');
      box.className = 'act-group';
      if (i < 3 || g.items.some(function (x) { return x.overdue; })) box.open = true;
      var sum = U.node('summary', null, g.label);
      sum.appendChild(U.node('span', 'act-count', String(g.count)));
      box.appendChild(sum);
      var list = U.node('ul', 'act-list');
      g.items.forEach(function (it) { list.appendChild(itemRow(it, onDone)); });
      box.appendChild(list);
      mount.appendChild(box);
    });
  }

  global.DSWORK = { render: render, itemRow: itemRow, jobHref: jobHref, moveBody: moveBody, offerUndo: offerUndo, NAME: NAME, AREA_OF: AREA_OF };
})(window);
