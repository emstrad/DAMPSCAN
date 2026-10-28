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

  async function open(c, opts) {
    var d = shell(); d.textContent = '';
    var top = U.node('div', 'scc-top');
    top.appendChild(U.node('h2', null, (c.name || 'No name') + (c.postcode ? ', ' + c.postcode : '')));
    top.appendChild(btn('Close', null, function () { d.close(); }));
    d.appendChild(top);
    d.appendChild(U.node('p', 'meta', (c.site === 'ati-london' ? 'ATi' : 'DampScan') + ' · ' + ({ new: 'New enquiry', contacted: 'Contacted', waiting: 'Waiting for time', cold: 'Gone cold' }[c.stage] || '')));
    if (!(c.log || []).length) d.appendChild(U.node('p', 'sheet-next', 'Nobody in touch yet: call them.'));
    /* One row of quick contacts, then the facts; the number stays readable underneath. */
    var tel = c.phone ? String(c.phone).replace(/[^\d+]/g, '') : '';
    var acts = U.node('div', 'sheet-grid');
    var chip = function (text, href, main) { var a = U.node('a', 'sheet-big' + (main ? ' is-main' : ''), text); a.href = href; if (/^https:/.test(href)) { a.target = '_blank'; a.rel = 'noopener'; } acts.appendChild(a); };
    if (tel) { chip('Call', 'tel:' + tel, true); chip('Text', 'sms:' + tel); chip('WhatsApp', 'https://wa.me/' + tel.replace(/^\+/, '').replace(/^0/, '44')); }
    if (c.email) chip('Email', 'mailto:' + c.email);
    /* A job already made opens as the same full card as everywhere else. */
    if (c.kind === 'job' && global.DSPOP) { var fj = btn('Full job', 'sheet-big', function () { d.close(); global.DSPOP.open(c.id, { onChange: opts.reload }); }); acts.appendChild(fj); }
    if (acts.children.length) d.appendChild(acts);
    if (c.phone || c.email) d.appendChild(U.node('p', 'meta', [c.phone, c.email].filter(Boolean).join(' · ')));
    /* Where contact stands, first: the urgent thing is a customer nobody has rung. */
    var enq = document.createElement('details'); enq.className = 'sheet-fold';
    enq.appendChild(U.node('summary', null, 'Their enquiry'));
    [line('Problem', (c.issues || []).join(', ')), line('Message', c.notes)].forEach(function (n) { if (n) enq.appendChild(n); });
    [line('Address', [c.street, c.postcode].filter(Boolean).join(', ')),
      line('Chose', c.chose ? (c.chose.unsure ? 'Not sure, help them choose' : c.chose.name + ' (' + (c.chose.from ? 'from ' : '') + '£' + c.chose.price + ')' + ((c.chose.addOns || []).length ? ' + ' + c.chose.addOns.map(function (a) { return a.name.toLowerCase() + ' (£' + a.price + ')'; }).join(', ') : '')) : null),
      line('Agent', c.agent)].forEach(function (n) { if (n) d.appendChild(n); });
    if (enq.children.length > 1) d.appendChild(enq);
    /* Book, Move to, the hold, photos, times wanted and Close (sched-detail.js). */
    if (global.DSSCHEDDETAIL && opts.act) global.DSSCHEDDETAIL.fill(d, c, opts, function () { d.close(); });
    if (!(c.best || []).length && !c.pencil) d.appendChild(U.node('p', 'meta', 'No free time in the next two weeks: check My hours.'));
    if ((c.best || []).length && !c.pencil) {
      d.appendChild(U.node('h3', null, 'Times to offer'));
      /* The best three in view, the rest a tap away. */
      var more = document.createElement('details'); more.className = 'sheet-fold';
      c.best.slice(0, 6).forEach(function (s, i) {
        var b = btn('', 'sched-best' + (i ? ' is-alt' : ''), function () { d.close(); opts.book(c, s); });
        b.appendChild(U.node('b', null, day(s.date) + ', ' + s.time + ', ' + cap(s.surveyor)));
        b.appendChild(U.node('span', 'meta', s.why));
        (i < 3 ? d : more).appendChild(b);
      });
      if (c.best.length > 3) { more.insertBefore(U.node('summary', null, 'More times (' + (Math.min(6, c.best.length) - 3) + ')'), more.firstChild); d.appendChild(more); }
    }
    d.appendChild(U.node('h3', null, 'History'));
    var row = U.node('div', 'sched-row');
    var how = document.createElement('select'); how.setAttribute('aria-label', 'What happened');
    [['call', 'Called'], ['email', 'Emailed'], ['text', 'Texted'], ['note', 'Note']].forEach(function (h) { var o = document.createElement('option'); o.value = h[0]; o.textContent = h[1]; how.appendChild(o); });
    var said = document.createElement('input'); said.placeholder = 'What was said'; said.setAttribute('aria-label', 'What was said');
    row.appendChild(how); row.appendChild(said);
    row.appendChild(btn('Log', 'btn btn--sm', async function () { await opts.act({ op: 'log', kind: c.kind, id: c.id, how: how.value, note: said.value }, 'Logged on ' + (c.name || 'the card') + '.'); said.value = ''; history(c, list); }));
    d.appendChild(row);
    var past = document.createElement('details'); past.className = 'sheet-fold';
    past.appendChild(U.node('summary', null, 'Everything so far'));
    var list = U.node('ol', 'scc-list'); past.appendChild(list); d.appendChild(past);
    var fold = global.DSSCHEDDETAIL && global.DSSCHEDDETAIL.closeBox();
    if (fold) d.appendChild(fold);
    d.showModal();
    history(c, list);
  }

  async function history(c, list) {
    list.textContent = '';
    list.appendChild(U.node('li', 'panel-note', 'Loading.'));
    try {
      var r = await U.get('/api/admin/scheduling?card=' + c.kind + ':' + c.id);
      list.textContent = '';
      if (!r.entries.length) list.appendChild(U.node('li', 'meta', 'Nothing logged yet.'));
      r.entries.forEach(function (e) { list.appendChild(entry(e)); });
    } catch (e) { list.textContent = 'Could not load the history.'; }
  }

  global.DSSCHEDCARD = { open: open, entry: entry };
})(window);
