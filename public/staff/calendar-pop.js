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

  /* fold 'open' or 'closed' makes the section one tap-to-open line: what
     is urgent stays in view, the rest waits folded (the owners' choice). */
  function section(title, fold, into) {
    var s;
    if (fold) { s = U.node('details', 'sheet-sec sheet-fold'); s.open = fold === 'open'; s.appendChild(U.node('summary', null, title)); }
    else { s = U.node('section', 'sheet-sec'); if (title) s.appendChild(U.node('h3', null, title)); }
    (into || body).appendChild(s);
    return s;
  }
  /* A part kept in its own file, loaded the first time it is needed, drawn in its place. */
  function part(name, src, draw) {
    var slot = U.node('div');
    body.appendChild(slot);
    var go = function () { draw(function (t, f) { return section(t, f, slot); }); };
    if (global[name]) go();
    else { var sc = document.createElement('script'); sc.src = src; sc.onload = go; document.head.appendChild(sc); }
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
  /* A tick that texts the customer says so, and that Undo in the two minutes stops it (lib/texts.js). */
  var TEXTS = ['depositPaid', 'paid', 'surveySent'];
  function tick(j, field, label, on, words) {
    var l = U.node('label', 'sheet-tick');
    /* A surveyor's report tick texts nobody: it waits for an owner (lib/report-check.js). */
    var R = global.DSAREA && global.DSAREA.rights;
    var texts = /^(dampscan|ati-london)$/.test(j.site) && TEXTS.indexOf(field) !== -1 && !(R && R.worker && field === 'surveySent');
    var who = String(j.customerName || '').trim().split(/\s+/)[0] || 'them';
    if (texts) words += ' ' + who + ' gets a text in 2 minutes: Undo stops it.';
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
    l.appendChild(U.node('span', null, label + (texts && !on ? ' (texts ' + who + ' in 2 min)' : '')));
    return l;
  }

  function notes(j) {
    var s = section('Notes' + (j.note ? '' : ' (none)'), 'closed');
    if (j.quoted && !j.money) { s.appendChild(U.node('p', 'sheet-note', j.note || 'No notes.')); return s; }
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
    return s;
  }

  /* Messages sent by hand: with the automatic texts on, only what they never
     cover (asking the estate agent for a time, offering a remedial quote);
     with them off, the booking and deposit words as well. Hidden when empty. */
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
      if (!j.textsOn) add(m.confirm, 'Booking confirmation');
      if (!j.textsOn && !j.depositPaid) add(m.deposit, 'Deposit request');
      if (j.awaitingAgent) add(m.chase, 'Ask the agent for a time');
      /* DampScan sells survey and report only, so never offers remedial work. */
      if (j.reportSent && j.site !== 'dampscan') add(m.remedial, 'Offer to quote the remedial work');
      if (!list.children.length) s.remove();
    } catch (e) { s.remove(); }
  }

  /* Their page asked for a new time: one tap moves it there (drive check, surveyor told, the "as you asked" text after 2 minutes). */
  function moveAsked(j) {
    var a = j.moveAsked, box = U.node('div', 'sheet-ask'), it = { jobId: j.id, quoted: false, status: j.status };
    box.appendChild(U.node('p', 'panel-note', 'They asked on their page to move to ' + shortDate(a.date) + ', ' + a.time + '.'));
    var go = U.node('button', 'btn btn--primary btn--sm', 'Move to ' + shortDate(a.date) + ', ' + a.time); go.type = 'button';
    go.addEventListener('click', async function () {
      go.disabled = true;
      var r = await U.send('/api/admin/clients', W.moveBody(it, a.date, a.time));
      if (!r.ok && r.data && r.data.clash && global.confirm(r.data.clash.replace(' Send force to book it anyway.', '') + ' Move it anyway?')) r = await U.send('/api/admin/clients', Object.assign(W.moveBody(it, a.date, a.time), { force: true }));
      go.disabled = false;
      if (!r.ok) { box.appendChild(U.node('p', 'panel-note', (r.data && (r.data.message || r.data.error)) || 'Not saved')); return; }
      W.offerUndo(j.textsOn ? 'Moved as they asked. ' + (String(j.customerName || '').split(' ')[0] || 'They') + ' gets a text in 2 minutes: Undo stops it.' : 'Moved as they asked.', function () { return U.send('/api/admin/clients', W.moveBody(it, j.date, j.time)); }, changed);
      changed();
    });
    box.appendChild(go); body.appendChild(box);
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
    var n = (j.todos || []).length + (j.maybeDone || []).length;
    var td = section('To-dos' + (n ? ' (' + n + ')' : ''), n ? 'open' : 'closed');
    /* Ones the facts look to have done are asked about in the list (job-todos.js). */
    var box = U.node('div');
    td.appendChild(box);
    global.DSTODOS.render(box, j.id, j.todos, changed, { maybe: j.maybeDone || [] });
  }

  function cap(x) { return x ? x.charAt(0).toUpperCase() + x.slice(1) : x; }
  function journey(j) {
    var k = { body: body, section: section, part: part, tick: tick, notes: notes, todos: todos, outstanding: outstanding, moveAsked: moveAsked, dampMessages: dampMessages, changed: changed, cap: cap, link: link };
    if (global.DSPOPJ) { global.DSPOPJ.draw(j, k); return; }
    var sc = document.createElement('script'); sc.src = '/staff/pop-journey.js';
    sc.onload = function () { if (ctx.id === j.id) global.DSPOPJ.draw(j, k); }; document.head.appendChild(sc);
  }

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
    sub.appendChild(U.node('span', 'sheet-status', j.stage || (j.status === 'quoted' && j.accepted ? 'accepted' : j.status)));
    sub.appendChild(U.node('span', 'sheet-when', !j.dateSet ? 'Not booked in yet' : shortDate(j.date) + (j.time ? ', ' + j.time : ', time to confirm')));

    /* ATi and DampScan: the customer card in journey order (pop-journey.js); Verge and CoolRight as they were. */
    if (!j.quoted && /^(dampscan|ati-london)$/.test(j.site)) journey(j);
    else {
      outstanding(j);
      X.where(j, section('Where'));
      if (!j.dateSet && j.status !== 'paid') X.dateForm(j, section, changed);
      var js = section('Job');
      if (j.money) {
        X.facts(js, [['Quote', U.money(j.money.pricePence)], ['Received', U.money(j.money.receivedPence)],
          ['To collect', j.money.pricePence > j.money.receivedPence ? U.money(j.money.pricePence - j.money.receivedPence) : null]]);
        js.appendChild(link('Record a payment', W.jobHref(j.site, j.id, true), 'act-main'));
      } else js.appendChild(U.node('p', 'panel-note', 'Money is shown to the manager.'));
      if (j.coolright && global.DSPOPAC) global.DSPOPAC.render(j, section, changed);
      notes(j);
      todos(j);
      var pics = (j.files || []).length + (j.photos || []).length;
      X.pictures(j, section('Photos' + (pics ? ' (' + pics + ')' : ''), 'closed'), changed);
      if (j.dateSet && j.status !== 'paid') X.dateForm(j, section, changed);
    }

    foot.appendChild(link(j.quoted ? 'Open job page' : 'Open full card', W.jobHref(j.site, j.id, j.quoted), 'act-main'));
    if (!j.quoted) foot.appendChild(link('Edit details', '/staff/clients.html?area=damp#job-' + j.id, 'pill'));
    /* Deleting cannot be undone, so it asks once, by name, before it goes. A damp
       customer is never deleted while live (the server refuses): only a cancelled mistake. */
    if (!j.quoted && j.status !== 'cancelled') return;
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
