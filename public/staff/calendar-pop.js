/* The job pop-up on Today: tap a job on the timeline or in a list and this
   sheet shows everything about it, with every action on it, without leaving
   the page. Today and the survey and job boards all open it. It reads one job (/api/admin/calendar?view=job) and reuses what
   already acts on jobs elsewhere: the client card's ticks and date (the
   clients route, as client-dialog.js writes them), the quoted board's status
   change for a Verge or CoolRight date, the "Action needed" rows of
   calendar-actions.js (messages, ticks, snooze, each with Undo), the survey
   message words, and the to-do ticks. The full card or job page is one tap
   away for anything bigger (photos, quote lines, payments). */
(function (global) {
  'use strict';

  var U = global.DSUI;
  var W = global.DSWORK;
  var ctx = { id: null, work: null, onChange: null };

  var dlg = document.createElement('dialog');
  dlg.className = 'sheet';
  dlg.setAttribute('aria-labelledby', 'pop-name');
  var head = U.node('header', 'sheet-head');
  var name = U.node('h2', null, '');
  name.id = 'pop-name';
  var shut = U.node('button', 'btn btn--ghost btn--sm sheet-close', 'Close');
  shut.type = 'button';
  shut.addEventListener('click', function () { dlg.close(); });
  var top = U.node('div', 'sheet-top');
  top.appendChild(name);
  top.appendChild(shut);
  head.appendChild(top);
  var sub = U.node('p', 'sheet-sub');
  head.appendChild(sub);
  var body = U.node('div', 'sheet-body');
  var foot = U.node('footer', 'sheet-foot');
  dlg.appendChild(head);
  dlg.appendChild(body);
  dlg.appendChild(foot);
  document.body.appendChild(dlg);
  /* A tap on the dimmed backdrop closes it, as on any phone sheet. */
  dlg.addEventListener('click', function (ev) { if (ev.target === dlg) dlg.close(); });
  /* The page behind stays put while the sheet scrolls. */
  dlg.addEventListener('close', function () { document.documentElement.classList.remove('is-locked'); });

  function section(title) {
    var s = U.node('section', 'sheet-sec');
    if (title) s.appendChild(U.node('h3', null, title));
    body.appendChild(s);
    return s;
  }
  function link(text, href, cls) {
    var a = U.node('a', 'pill act ' + (cls || ''), text);
    a.href = href;
    if (/^https:/.test(href)) { a.target = '_blank'; a.rel = 'noopener'; }
    return a;
  }
  function changed() { Promise.resolve(ctx.onChange && ctx.onChange()).then(load, load); }
  function shortDate(s) { return new Date(s + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }); }

  /* A damp tick: one write to the client card's route, five seconds to undo. */
  function tick(j, field, label, on, words) {
    var l = U.node('label', 'sheet-tick');
    var box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = on;
    box.addEventListener('change', async function () {
      var b = { id: j.id }; b[field] = box.checked;
      box.disabled = true;
      var r = await U.send('/api/admin/clients', b);
      box.disabled = false;
      if (!r.ok) { box.checked = !box.checked; return; }
      var back = { id: j.id }; back[field] = !box.checked;
      W.offerUndo(box.checked ? words : label + ' unticked.', function () { return U.send('/api/admin/clients', back); }, changed);
      changed();
    });
    l.appendChild(box);
    l.appendChild(U.node('span', null, label));
    return l;
  }

  function dateForm(j) {
    var s = section(j.dateSet ? 'Date' : 'Book it in');
    var f = U.node('form', 'sheet-row');
    var d = document.createElement('input'); d.type = 'date'; d.required = true; d.value = j.dateSet ? j.date : ''; d.setAttribute('aria-label', 'Date');
    var t = document.createElement('input'); t.type = 'time'; t.value = j.time || ''; t.setAttribute('aria-label', 'Time');
    var save = U.node('button', 'btn btn--primary btn--sm', j.dateSet ? 'Move' : 'Set date');
    save.type = 'submit';
    f.appendChild(d); f.appendChild(t); f.appendChild(save);
    var note = U.node('p', 'panel-note');
    f.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var it = { jobId: j.id, quoted: j.quoted, status: j.status };
      var r = await U.send('/api/admin/' + (j.quoted ? 'quoted' : 'clients'), W.moveBody(it, d.value, t.value));
      /* Inside the drive to or from another survey: say so, and only go ahead if asked. */
      if (!r.ok && r.data && r.data.clash && global.confirm(r.data.clash.replace(' Send force to book it anyway.', '') + ' Move it anyway?')) r = await U.send('/api/admin/' + (j.quoted ? 'quoted' : 'clients'), Object.assign(W.moveBody(it, d.value, t.value), { force: true }));
      if (!r.ok) { note.textContent = (r.data && (r.data.message || JSON.stringify(r.data.errors || {}))) || 'Not saved'; return; }
      if (j.dateSet) W.offerUndo('Moved. Remember to let the customer know.', function () { return U.send('/api/admin/' + (j.quoted ? 'quoted' : 'clients'), W.moveBody(it, j.date, j.time)); }, changed);
      changed();
    });
    s.appendChild(f);
    s.appendChild(note);
  }

  function notes(j) {
    var s = section('Notes');
    if (j.quoted && !j.money) { s.appendChild(U.node('p', 'sheet-note', j.note || 'No notes.')); return; }
    var f = U.node('form', 'sheet-notes');
    var ta = document.createElement('textarea');
    ta.rows = 3; ta.maxLength = 2000; ta.value = j.note || ''; ta.setAttribute('aria-label', 'Notes');
    var save = U.node('button', 'btn btn--ghost btn--sm', 'Save notes');
    save.type = 'submit';
    var said = U.node('span', 'panel-note');
    f.appendChild(ta); f.appendChild(save); f.appendChild(said);
    f.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      /* A quoted job's notes are part of its whole save, so the rest goes back as it was. */
      var r = j.quoted
        ? await U.send('/api/admin/quoted', { op: 'save', id: j.id, site: j.site, customerName: j.customerName, customerPostcode: j.postcode, note: ta.value,
          invoiceNetPence: j.money.pricePence, status: j.status, jobDate: j.date, jobTime: j.time || '' })
        : await U.send('/api/admin/clients', { id: j.id, note: ta.value });
      said.textContent = r.ok ? 'Saved.' : 'Not saved.';
    });
    s.appendChild(f);
  }

  /* Ready messages as one tidy list: a title, then the WhatsApp, text and
     email links (messages.js) that send the words. */
  async function dampMessages(j, s) {
    var list = U.node('ul', 'sheet-msgs');
    s.appendChild(list);
    try {
      var data = await U.get('/api/admin/surveys?view=messages&id=' + j.id);
      var m = data.messages || {};
      var add = function (msg, title) {
        if (!msg || !global.DSMSG) return;
        var li = U.node('li', null);
        li.appendChild(U.node('p', 'sheet-label', title));
        li.appendChild(global.DSMSG.buttons(j.id, msg, null));
        list.appendChild(li);
      };
      add(m.confirm, 'Booking confirmation');
      if (!j.depositPaid) add(m.deposit, 'Deposit request');
      if (j.awaitingAgent) add(m.chase, 'Ask the agent for a time');
      if (j.reportSent) add(m.remedial, 'Offer to quote the remedial work');
      if (!list.children.length) s.appendChild(U.node('p', 'panel-note', 'No messages ready.'));
    } catch (e) { s.appendChild(U.node('p', 'panel-note', 'Messages are on the full card.')); }
  }

  function outstanding(j) {
    var items = [];
    (((ctx.work && ctx.work()) || {}).groups || []).forEach(function (g) { g.items.forEach(function (it) { if (it.jobId === j.id) items.push(it); }); });
    if (!items.length) return;
    var out = section('Needs doing (' + items.length + ')');
    var ul = U.node('ul', 'act-list');
    items.forEach(function (it) { ul.appendChild(W.itemRow(it, changed)); });
    out.appendChild(ul);
  }

  function todos(j) {
    var td = section('To-dos for this customer');
    var box = U.node('div');
    td.appendChild(box);
    global.DSTODOS.render(box, j.id, j.todos, changed);
  }

  function cap(x) { return x ? x.charAt(0).toUpperCase() + x.slice(1) : x; }

  /* One sheet, in the order a surveyor needs it: where, the job, notes,
     pictures, messages, the date. Verge and CoolRight get their money and
     kit in place of the survey ticks. */
  function draw(j) {
    var X = global.DSPOPX;
    body.textContent = '';
    foot.textContent = '';
    name.textContent = j.customerName || 'No name';
    sub.textContent = '';
    sub.appendChild(U.node('span', 'tl-biz', W.NAME[j.site] || j.business));
    sub.appendChild(U.node('span', 'sheet-status', j.status === 'quoted' && j.accepted ? 'accepted' : j.status));
    sub.appendChild(U.node('span', 'sheet-when', !j.dateSet ? 'Not booked in yet' : shortDate(j.date) + (j.time ? ', ' + j.time : ', time to confirm')));

    outstanding(j);
    X.where(j, section('Where'));

    var js = section('Job');
    if (!j.quoted) {
      X.facts(js, [['Survey', j.surveyType], ['Surveyor', cap(j.surveyor)], ['Price', j.money ? U.money(j.money.pricePence) : null], ['Agent', X.agentLine(j.agent)]]);
      if (j.money) {
        js.appendChild(tick(j, 'depositPaid', 'Deposit paid (' + U.money(j.money.depositPence) + ')', j.depositPaid, 'Deposit marked paid.'));
        js.appendChild(tick(j, 'paid', 'Paid in full', j.paid, 'Marked paid in full.'));
      }
      js.appendChild(tick(j, 'surveySent', 'Report sent', j.reportSent, 'Report marked sent.'));
      /* A surveyor who only works here marks the report; the rest is the manager's. */
      if (!global.DSAREA.rights || !global.DSAREA.rights.known || global.DSAREA.rights.manages[j.site]) js.appendChild(tick(j, 'awaitingAgent', 'Awaiting estate agent', j.awaitingAgent, 'Marked awaiting the agent.'));
    } else if (j.money) {
      X.facts(js, [['Quote', U.money(j.money.pricePence)], ['Received', U.money(j.money.receivedPence)],
        ['To collect', j.money.pricePence > j.money.receivedPence ? U.money(j.money.pricePence - j.money.receivedPence) : null]]);
      js.appendChild(link('Record a payment', W.jobHref(j.site, j.id, true), 'act-main'));
    } else js.appendChild(U.node('p', 'panel-note', 'Money is shown to the manager.'));
    if (j.coolright && global.DSPOPAC) global.DSPOPAC.render(j, section, changed);

    notes(j);
    if (j.lead && (j.lead.notes || j.lead.issues.length)) {
      var en = section('From the enquiry');
      if (j.lead.issues.length) en.appendChild(U.node('p', 'sheet-note', 'Issues: ' + j.lead.issues.join(', ')));
      if (j.lead.notes) en.appendChild(U.node('p', 'sheet-note', j.lead.notes));
    }
    X.pictures(j, section('Photos and files'), changed);
    if (!j.quoted) dampMessages(j, section('Messages'));
    if (j.status !== 'paid') dateForm(j);
    todos(j);

    foot.appendChild(link(j.quoted ? 'Open job page' : 'Open full card', W.jobHref(j.site, j.id, j.quoted), 'act-main'));
    /* Deleting cannot be undone, so it asks once, by name, before it goes. */
    var del = U.node('button', 'pill act-delete', 'Delete job');
    del.type = 'button';
    del.addEventListener('click', async function () {
      if (!global.confirm('Delete ' + (j.customerName || 'this job') + '? This removes the job and everything on it, and cannot be undone.')) return;
      del.disabled = true;
      var r = await U.send('/api/admin/jobs', { id: j.id }, 'DELETE');
      if (r.ok) { global.location.reload(); return; }
      del.disabled = false;
      global.alert(r.status === 404 ? 'Only a manager can delete jobs for this business.' : 'Could not delete this job.');
    });
    foot.appendChild(del);
  }

  async function load() {
    try {
      var data = await U.get('/api/admin/calendar?view=job&id=' + ctx.id);
      var keep = body.scrollTop;
      draw(data.job);
      body.scrollTop = keep;
    } catch (e) {
      body.textContent = '';
      body.appendChild(U.node('p', 'panel-note', e.message || 'Could not load this job.'));
    }
  }

  function open(id, opts) {
    ctx.id = id;
    ctx.work = (opts && opts.work) || null;
    ctx.onChange = opts && opts.onChange;
    name.textContent = 'Loading…';
    sub.textContent = '';
    body.textContent = '';
    foot.textContent = '';
    if (!dlg.open) { dlg.showModal(); document.documentElement.classList.add('is-locked'); }
    load();
  }

  global.DSPOP = { open: open };
})(window);
