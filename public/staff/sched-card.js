/* The customer card on Scheduling: tap a card on the board and this opens,
   like the client card elsewhere, with the basic details and then everything
   that has passed with the customer, newest first: calls, texts, notes,
   times wanted, emails in full (filed by ChatGPT or the inbox scan) and what
   the team did. Today's pop-up keeps only the basics; this is Scheduling's. */
(function (global) {
  'use strict';
  var U = global.DSUI;
  var cap = function (s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; };
  function when(iso) { return new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  function day(d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); }
  function btn(text, cls, fn) { var b = U.node('button', cls || 'btn btn--ghost btn--sm', text); b.type = 'button'; b.addEventListener('click', fn); return b; }
  function line(label, value) { if (!value) return null; var p = U.node('p', 'scc-line'); p.appendChild(U.node('b', null, label + ': ')); p.appendChild(document.createTextNode(value)); return p; }

  var dlg = null;
  function shell() {
    if (dlg) return dlg;
    dlg = document.createElement('dialog'); dlg.className = 'sched-dialog scc';
    document.body.appendChild(dlg);
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    return dlg;
  }

  function entry(e) {
    var li = U.node('li', 'scc-entry is-' + e.kind + (e.dir ? ' is-' + e.dir : ''));
    /* A filed email has a subject or its words; "Emailed" logged by hand is just what was typed. */
    /* An automatic text: which one, whether it arrived, and its words a tap away. */
    if (e.kind === 'sms') {
      li.appendChild(U.node('span', 'scc-when', { waiting: 'Text waiting to go', failed: 'Text not sent', delivered: 'Text delivered', sent: 'Text sent', off: 'Text not sent (texts were off)', stopped: 'Text stopped' }[e.state] + ' · ' + when(e.at)));
      li.appendChild(U.node('b', null, e.subject));
      if (e.text) li.appendChild(U.node('span', 'meta', e.text));
      if (e.body) { var t = document.createElement('details'); t.appendChild(U.node('summary', null, 'Read the text')); t.appendChild(U.node('p', 'scc-body', e.body)); li.appendChild(t); }
      return li;
    }
    var filed = e.kind === 'email' && (e.subject || e.body);
    var label = filed ? (e.dir === 'out' ? 'Email to them' : 'Email from them') : { call: 'Called', email: 'Emailed', text: 'Texted', note: 'Note', action: 'Done', fact: 'Survey' }[e.kind] || 'Note';
    li.appendChild(U.node('span', 'scc-when', label + ' · ' + when(e.at) + (e.by ? ' · ' + e.by : '')));
    if (filed) {
      /* Older emails were filed as "(no subject)"; name them by their first words instead. */
      var subj = e.subject && e.subject !== '(no subject)' ? e.subject : String(e.body || '').trim().split('\n')[0].slice(0, 80);
      li.appendChild(U.node('b', null, subj || 'No subject line'));
      if (e.body) { var d = document.createElement('details'); d.appendChild(U.node('summary', null, 'Read the email')); d.appendChild(U.node('p', 'scc-body', e.body)); li.appendChild(d); }
    } else li.appendChild(U.node('span', e.text ? null : 'meta', e.text || 'Nothing was written with this one.'));
    return li;
  }

  /* A folded line: everything that is not needed this minute is one tap away. */
  function fold(d, title, fill) {
    var f = document.createElement('details'); f.className = 'scc-fold';
    var sum = U.node('summary', null, title); f.appendChild(sum);
    fill(f);
    if (f.children.length > 1) d.appendChild(f);
    return f;
  }
  var STAGE = { new: 'New enquiry', contacted: 'Contacted', waiting: 'Waiting for time', cold: 'Gone cold' };
  function chose(c) {
    var x = c.chose;
    if (!x) return null;
    if (x.unsure) return 'Not sure, help them choose';
    return x.name + ' (' + (x.from ? 'from ' : '') + '£' + x.price + ')' + ((x.addOns || []).length ? ' + ' + x.addOns.map(function (a) { return a.name.toLowerCase() + ' (£' + a.price + ')'; }).join(', ') : '');
  }

  /* Urgent first (the one next step, a hold to decide, call them, book them),
     then the log box, then everything else folded: details, move or close, history. */
  async function open(c, opts) {
    var d = shell(); d.textContent = '';
    var D = global.DSSCHEDDETAIL, N = global.DSSCHEDNEXT;
    var shut = function () { d.close(); };
    var act = function (body, said) { shut(); return opts.act(body, said); };
    var top = U.node('div', 'scc-top');
    var title = U.node('div');
    title.appendChild(U.node('h2', null, (c.name || 'No name') + (c.postcode ? ', ' + c.postcode : '')));
    title.appendChild(U.node('p', 'meta', [c.site === 'ati-london' ? 'ATi' : 'DampScan', STAGE[c.stage], c.wanted ? 'Wants ' + c.wanted : null].filter(Boolean).join(' · ')));
    top.appendChild(title);
    var x = btn('×', 'scc-x', shut); x.setAttribute('aria-label', 'Close');
    top.appendChild(x);
    d.appendChild(top);

    if (!(c.log || []).length) d.appendChild(U.node('div', 'scc-step is-due', 'Nobody in touch yet: call them'));
    else if (N && opts.act) { var step = N.status(c, opts.act, shut); if (step) d.appendChild(step); }
    if (D && opts.act) D.urgent(c, act, function (slot) { shut(); opts.book(c, slot); }).forEach(function (n) { d.appendChild(n); });

    /* One row of quick contacts; the number stays readable underneath. */
    var tel = c.phone ? String(c.phone).replace(/[^\d+]/g, '') : '';
    var acts = U.node('div', 'sheet-grid');
    var chip = function (text, href, main) { var a = U.node('a', 'sheet-big' + (main ? ' is-main' : ''), text); a.href = href; if (/^https:/.test(href)) { a.target = '_blank'; a.rel = 'noopener'; } acts.appendChild(a); };
    if (tel) { chip('Call', 'tel:' + tel, true); chip('Text', 'sms:' + tel); chip('WhatsApp', 'https://wa.me/' + tel.replace(/^\+/, '').replace(/^0/, '44')); }
    if (c.email) chip('Email', 'mailto:' + c.email);
    if (c.kind === 'job' && global.DSPOP) acts.appendChild(btn('Full job', 'sheet-big', function () { shut(); global.DSPOP.open(c.id, { onChange: opts.reload }); }));
    if (acts.children.length) d.appendChild(acts);
    if (c.phone || c.email) d.appendChild(U.node('p', 'meta scc-nums', [c.phone, c.email].filter(Boolean).join(' · ')));
    agentLine(d, c);

    /* Book it in, with the best times to offer under it (three, the rest folded). */
    if (opts.book) {
      d.appendChild(btn('Book it in', 'btn sched-bookit', function () { shut(); opts.book(c, null); }));
      if (!c.pencil) times(d, c, function (s) { shut(); opts.book(c, s); });
    }

    /* Log a call, email, text or note; each contact sets when to get back to them. */
    var log = U.node('div', 'scc-log');
    var how = document.createElement('select'); how.setAttribute('aria-label', 'What happened');
    [['call', 'Called'], ['email', 'Emailed'], ['text', 'Texted'], ['note', 'Note']].forEach(function (h) { var o = document.createElement('option'); o.value = h[0]; o.textContent = h[1]; how.appendChild(o); });
    var next = N && N.choice();
    var r1 = U.node('div', 'scc-pair'); r1.appendChild(how); if (next) r1.appendChild(next.select);
    log.appendChild(r1);
    if (next) log.appendChild(next.date);
    var said = document.createElement('input'); said.placeholder = 'What was said'; said.setAttribute('aria-label', 'What was said');
    var r2 = U.node('div', 'scc-pair is-send'); r2.appendChild(said);
    r2.appendChild(btn('Log', 'btn btn--sm', async function () {
      var body = { op: 'log', kind: c.kind, id: c.id, how: how.value, note: said.value };
      if (next && how.value !== 'note') body.next = next.value();
      await opts.act(body, 'Logged on ' + (c.name || 'the card') + '.'); said.value = ''; history(c, list, todoBox);
    }));
    log.appendChild(r2);
    if (next) how.addEventListener('change', function () { next.select.hidden = how.value === 'note'; next.date.hidden = how.value === 'note' || next.select.value !== 'date'; });
    if (opts.act) d.appendChild(log);

    /* The customer's to-dos, ticked here (job-todos.js), the same list as To-do. */
    var todoBox = U.node('div', 'scc-todos');
    d.appendChild(todoBox);

    var folds = U.node('div', 'scc-folds');
    fold(folds, 'Their details', function (f) {
      [line('Address', [c.street, c.postcode].filter(Boolean).join(', ')), line('Chose', chose(c)), line('Problem', (c.issues || []).join(', ')), line('Message', c.notes)]
        .forEach(function (n) { if (n) f.appendChild(n); });
      var pics = D && D.photos(c); if (pics) f.appendChild(pics);
      if (D && opts.act) { f.appendChild(U.node('p', 'meta', 'Times they want')); f.appendChild(D.wanted(c, act)); }
      if (opts.act) agentEdit(f, c, act);
    });
    if (D && opts.act) fold(folds, 'Move or close', function (f) { f.appendChild(D.move(c, act, function (slot) { shut(); opts.book(c, slot); })); });
    var past = fold(folds, 'Everything so far', function (f) { f.appendChild(U.node('ol', 'scc-list')); });
    var list = past.querySelector('.scc-list');
    d.appendChild(folds);
    d.showModal();
    /* The card itself takes focus, so the close button is not lit up on opening. */
    d.tabIndex = -1; d.focus();
    history(c, list, todoBox);
  }

  function times(d, c, pick) {
    var best = (c.best || []).slice(0, 6);
    if (!best.length) { d.appendChild(U.node('p', 'meta', 'No free time in the next two weeks: check My hours.')); return; }
    var box = U.node('div', 'scc-times');
    var more = document.createElement('details'); more.className = 'scc-more';
    best.forEach(function (s, i) {
      var b = btn('', 'scc-time', function () { pick(s); });
      b.appendChild(U.node('b', null, day(s.date) + ', ' + s.time));
      b.appendChild(U.node('span', null, cap(s.surveyor)));
      b.title = s.why || '';
      (i < 3 ? box : more).appendChild(b);
    });
    d.appendChild(box);
    /* Why the first one is best, once, rather than under every time. */
    if (best[0].why) d.appendChild(U.node('p', 'meta scc-why', best[0].why));
    if (best.length > 3) { more.insertBefore(U.node('summary', null, 'More times'), more.firstChild); d.appendChild(more); }
  }

  /* The estate agent in view when there is one: who, with Call and Email. */
  function agentLine(d, c) {
    var a = c.agentInfo;
    if (!a) return;
    var row = U.node('div', 'scc-agent');
    row.appendChild(U.node('span', null, 'Agent: ' + [a.name, a.branch].filter(Boolean).join(', ')));
    if (a.phone) { var t = U.node('a', 'scc-link', 'Call'); t.href = 'tel:' + String(a.phone).replace(/[^\d+]/g, ''); row.appendChild(t); }
    if (a.email) { var m = U.node('a', 'scc-link', 'Email'); m.href = 'mailto:' + a.email; row.appendChild(m); }
    d.appendChild(row);
  }

  /* Add, change or remove the agent, inside Their details. */
  function agentEdit(f, c, act) {
    var a = c.agentInfo;
    var ed = document.createElement('details'); ed.className = 'todo-addfold';
    ed.appendChild(U.node('summary', null, a ? 'Change the estate agent' : '+ Add an estate agent'));
    var box = U.node('div', 'sched-row');
    var fields = [['name', 'Agent name'], ['branch', 'Branch'], ['phone', 'Phone'], ['email', 'Email']].map(function (k) {
      var i = document.createElement('input'); i.placeholder = k[1]; i.setAttribute('aria-label', k[1]); i.value = (a && a[k[0]]) || '';
      if (k[0] === 'phone') i.type = 'tel'; if (k[0] === 'email') i.type = 'email';
      box.appendChild(i); return [k[0], i];
    });
    var save = function (agent) { return act({ op: 'agent', kind: c.kind, id: c.id, agent: agent }, agent ? 'Estate agent saved for ' + (c.name || 'the card') + '.' : 'Estate agent taken off.'); };
    box.appendChild(btn('Save agent', null, function () { var o = {}; fields.forEach(function (x) { o[x[0]] = x[1].value.trim(); }); save(o.name ? o : null); }));
    if (a) box.appendChild(btn('Remove', null, function () { save(null); }));
    ed.appendChild(box); f.appendChild(ed);
  }

  async function history(c, list, todoBox) {
    list.textContent = '';
    list.appendChild(U.node('li', 'panel-note', 'Loading.'));
    try {
      var r = await U.get('/api/admin/scheduling?card=' + c.kind + ':' + c.id);
      list.textContent = '';
      if (todoBox && global.DSTODOS) {
        todoBox.textContent = '';
        if ((r.todos || []).length) todoBox.appendChild(U.node('h3', null, 'To-dos'));
        var mount = U.node('div'); todoBox.appendChild(mount);
        global.DSTODOS.render(mount, c.kind === 'job' ? c.id : { leadId: c.id }, r.todos || [], function () { history(c, list, todoBox); }, { fold: true });
      }
      if (!r.entries.length) list.appendChild(U.node('li', 'meta', 'Nothing logged yet.'));
      r.entries.forEach(function (e) { list.appendChild(entry(e)); });
    } catch (e) { list.textContent = 'Could not load the history.'; }
  }

  global.DSSCHEDCARD = { open: open, entry: entry };
})(window);
