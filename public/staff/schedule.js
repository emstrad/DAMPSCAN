/* Scheduling: the four columns before and up to booking. Cards drag between
   columns on a desktop; on a phone the "Move to" box does the same. Every
   change goes to /api/admin/scheduling, which checks the person's access. */
(function (global) {
  'use strict';
  var U = global.DSUI;
  var el = function (id) { return document.getElementById(id); };
  var COLS = [['new', 'New enquiry'], ['contacted', 'Contacted'], ['waiting', 'Waiting for time']];
  var HOW = [['call', 'Called'], ['email', 'Emailed'], ['text', 'Texted'], ['note', 'Note']];
  var data = null;
  var booking = null;
  var cap = function (s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; };
  function day(d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); }
  function ago(iso) {
    var m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000)), h = Math.round(m / 60);
    return m < 60 ? m + ' min ago' : h < 48 ? h + 'h ago' : Math.round(h / 24) + ' days ago';
  }

  /* After a change the card is brought into view, wherever its column now is. */
  var focusAfter = null;
  async function act(body, said) {
    var r = await U.send('/api/admin/scheduling', body);
    el('note').textContent = r.ok ? (said || '') : (r.data && r.data.error) || 'That did not save.';
    if (r.ok) { focusAfter = body.kind && body.id ? body.kind + '-' + body.id : null; load(); }
    return r;
  }

  function button(text, cls, fn) { var b = U.node('button', cls || 'btn btn--ghost btn--sm', text); b.type = 'button'; b.addEventListener('click', fn); return b; }

  function card(c) {
    var box = U.node('article', 'sched-card');
    box.id = c.kind + '-' + c.id;
    box.draggable = true;
    box.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', c.kind + ':' + c.id); });
    /* A tap on the card itself (not its buttons or boxes) opens the full customer card. */
    box.addEventListener('click', function (e) { if (!e.target.closest('button,a,input,select,textarea,summary,details,label')) global.DSSCHEDCARD.open(c, { act: act, book: openBook }); });
    box.appendChild(U.node('h3', null, (c.name || 'No name') + (c.postcode ? ', ' + c.postcode : '')));
    var bits = [c.site === 'ati-london' ? 'ATi' : 'DampScan', c.kind === 'lead' ? 'website enquiry ' + ago(c.since) : 'job, no time yet'];
    if (c.awaitingAgent) bits.push('waiting on ' + (c.agent || 'the agent'));
    if (c.deadline) bits.push('report needed by ' + c.deadline);
    box.appendChild(U.node('p', 'meta', bits.join(' · ')));
    /* Where contact stands, in plain sight: the latest call, email or note, or
       how long it has waited with nobody in touch. */
    var last = c.log.length ? c.log[c.log.length - 1] : null;
    var lastWords = last ? (HOW.find(function (h) { return h[0] === last.how; }) || ['', 'Note'])[1] + ' ' + ago(last.at) + ' by ' + last.by + (last.note ? ': ' + last.note : '') : null;
    box.appendChild(U.node('p', 'sched-status' + (last ? '' : ' is-cold'), last ? 'Latest: ' + lastWords : 'Nobody in touch yet, waiting ' + ago(c.since).replace(' ago', '')));
    if (c.wanted) box.appendChild(U.node('p', 'sched-status is-wanted', 'Times they want: ' + c.wanted));
    var contact = U.node('div', 'sched-row');
    if (c.phone) { var a = U.node('a', 'btn btn--ghost btn--sm', 'Call ' + c.phone); a.href = 'tel:' + c.phone; contact.appendChild(a); }
    if (c.email) { var m = U.node('a', 'btn btn--ghost btn--sm', 'Email'); m.href = 'mailto:' + c.email; contact.appendChild(m); }
    box.appendChild(contact);
    /* The whole enquiry here, so nobody needs the email or the Leads page. */
    if (c.street) box.appendChild(U.node('p', 'meta', c.street + (c.postcode ? ', ' + c.postcode : '')));
    if (c.issues && c.issues.length) box.appendChild(U.node('p', 'meta', 'Problem: ' + c.issues.join(', ')));
    if (c.notes) box.appendChild(U.node('p', 'sched-notes', c.notes));
    if (c.files && c.files.length) {
      var pics = U.node('div', 'sched-files');
      c.files.forEach(function (path) {
        var a = U.node('a', 'sched-file'); a.href = '/api/admin/attachment?path=' + encodeURIComponent(path); a.target = '_blank'; a.rel = 'noopener';
        var name = path.split('/').pop().replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '');
        if (/\.(jpe?g|png|gif|webp|heic)$/i.test(name)) { var img = document.createElement('img'); img.src = a.href; img.alt = 'Photo: ' + name; img.loading = 'lazy'; a.appendChild(img); }
        else a.textContent = name;
        pics.appendChild(a);
      });
      box.appendChild(pics);
    }
    if (c.held) box.appendChild(U.node('p', 'meta', 'Picked on the website: ' + new Date(c.held.at).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' with ' + cap(c.held.surveyor)));
    if (c.pencil) {
      var pc = c.pencil;
      var pen = U.node('div', 'sched-pencil');
      pen.appendChild(U.node('p', null, 'Pencilled: ' + day(pc.date) + ' ' + pc.time + ' with ' + cap(pc.surveyor) + (pc.byHand ? ', held until someone lets it go (waiting on the agent)'
        : ', held until ' + new Date(pc.until).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit' }))));
      if (pc.by) pen.appendChild(U.node('p', 'meta', 'By ' + pc.by + (pc.setAt ? ', ' + ago(pc.setAt) : '')));
      if (pc.sharing && pc.sharing.length) pen.appendChild(U.node('p', 'tl-clash', 'Also offered to ' + pc.sharing.join(', ') + '. Whoever says yes first gets it.'));
      var pr = U.node('div', 'sched-row');
      pr.appendChild(button('They said yes: book it', 'btn btn--sm', function () { openBook(c, pc); }));
      pr.appendChild(button('Let it go', null, function () { act({ op: 'unpencil', kind: c.kind, id: c.id }); }));
      pen.appendChild(pr);
      box.appendChild(pen);
    }
    /* The same person on another card: link the enquiry to the job, or close the spare enquiry. */
    (c.same || []).forEach(function (o) {
      var dup = U.node('div', 'sched-pencil');
      dup.appendChild(U.node('p', 'tl-clash', 'Looks like the same person as ' + (o.name || 'another card') + (o.postcode ? ', ' + o.postcode : '') + (o.kind === 'lead' ? ' (enquiry)' : ' (job)') + '.'));
      var dr = U.node('div', 'sched-row');
      if (c.kind === 'job' && o.kind === 'lead') dr.appendChild(button('Link their enquiry to this job', 'btn btn--sm', function () { act({ op: 'link', kind: 'job', id: c.id, leadId: o.id }); }));
      if (c.kind === 'lead') dr.appendChild(button('Close this one as a duplicate', null, function () { act({ op: 'close_dup', kind: 'lead', id: c.id }); }));
      dup.appendChild(dr);
      box.appendChild(dup);
    });
    if (c.log.length > 1) {
      var ul = U.node('ul');
      c.log.slice(0, -1).slice(-3).reverse().forEach(function (x) { ul.appendChild(U.node('li', null, (HOW.find(function (h) { return h[0] === x.how; }) || ['', 'Note'])[1] + ' by ' + x.by + ', ' + ago(x.at) + (x.note ? ': ' + x.note : ''))); });
      box.appendChild(ul);
    }
    /* Logging, wanted times and suggestions fold away so the card stays short;
       the last thing that happened shows above. */
    var more = document.createElement('details'); more.className = 'sched-more';
    more.appendChild(U.node('summary', null, 'Log a call, times wanted, suggestions'));
    /* Log a contact: what happened and an optional line about it. */
    var log = U.node('div', 'sched-row');
    var how = document.createElement('select'); how.setAttribute('aria-label', 'What happened');
    HOW.forEach(function (h) { var o = document.createElement('option'); o.value = h[0]; o.textContent = h[1]; how.appendChild(o); });
    var said = document.createElement('input'); said.placeholder = 'What was said'; said.setAttribute('aria-label', 'What was said');
    log.appendChild(how); log.appendChild(said);
    log.appendChild(button('Log', null, function () { act({ op: 'log', kind: c.kind, id: c.id, how: how.value, note: said.value }, 'Logged on ' + (c.name || 'the card') + '.'); }));
    more.appendChild(log);
    var want = U.node('div', 'sched-row');
    var wi = document.createElement('input'); wi.placeholder = 'Times they want, e.g. Sat mornings'; wi.value = c.wanted || ''; wi.setAttribute('aria-label', 'Times they want');
    want.appendChild(wi);
    want.appendChild(button('Save', null, function () { act({ op: 'wanted', kind: c.kind, id: c.id, text: wi.value }, 'Times saved for ' + (c.name || 'the card') + '.'); }));
    more.appendChild(want);
    /* Other good times nearest planned work (lib/best-fit.js), behind the fold. */
    var chips = U.node('div', 'sched-row');
    (c.best || []).slice(3).forEach(function (s) {
      chips.appendChild(button(day(s.date) + ' ' + s.time + ' ' + cap(s.surveyor), 'sched-chip', function () { openBook(c, s); }));
    });
    more.appendChild(chips);
    /* The single best time, in plain sight: closest to a survey already planned. */
    /* The best times to read out, best first, each with why (lib/best-fit.js). */
    if ((c.best || []).length && !c.pencil) {
      var opts = U.node('div', 'sched-opts');
      opts.appendChild(U.node('p', 'meta', 'Times to offer, best first:'));
      c.best.slice(0, 3).forEach(function (s, i) {
        var bb = button('', 'sched-best' + (i ? ' is-alt' : ''), function () { openBook(c, s); });
        bb.appendChild(U.node('b', null, (i + 1) + '. ' + day(s.date) + ' at ' + s.time + ' with ' + cap(s.surveyor)));
        bb.appendChild(U.node('span', 'meta', s.why));
        opts.appendChild(bb);
      });
      box.appendChild(opts);
    } else if (!c.pencil && !(c.best || []).length) box.appendChild(U.node('p', 'meta', 'No free time in the next two weeks. Ask the surveyors to set their usual week on My hours.'));
    else if (!c.pencil && c.at === null && c.postcode) box.appendChild(U.node('p', 'meta', 'Postcode not found, so no best fit.'));
    box.appendChild(more);
    var end = U.node('div', 'sched-row');
    var move = document.createElement('select'); move.setAttribute('aria-label', 'Move to');
    COLS.forEach(function (k) { if (c.kind === 'job' && k[0] === 'new') return; var o = document.createElement('option'); o.value = k[0]; o.textContent = 'Move to: ' + k[1]; if (k[0] === c.stage) o.selected = true; move.appendChild(o); });
    move.addEventListener('change', function () { act({ op: 'move', kind: c.kind, id: c.id, to: move.value }); });
    end.appendChild(move);
    end.appendChild(button('Book', 'btn btn--sm', function () { openBook(c, null); }));
    /* An enquiry that will not become a survey leaves the board, with why. */
    if (c.kind === 'lead') {
      var why = document.createElement('select'); why.setAttribute('aria-label', 'Why close it');
      ['Booked elsewhere', 'Not interested', 'No answer', 'Already sorted', 'Spam', 'Other'].forEach(function (w) { var o = document.createElement('option'); o.value = w; o.textContent = w; why.appendChild(o); });
      var shut = U.node('div', 'sched-row sched-close');
      shut.appendChild(why);
      shut.appendChild(button('Close enquiry', null, function () { act({ op: 'close', kind: 'lead', id: c.id, reason: why.value }, (c.name || 'Enquiry') + ' closed: ' + why.value + '. It stays on the Leads page.'); }));
      more.appendChild(shut);
    }
    box.appendChild(end);
    return box;
  }

  function column(key, title, cards) {
    var col = U.node('section', 'sched-col');
    var h = U.node('h2', null, title); h.appendChild(U.node('span', 'tag', String(cards.length)));
    col.appendChild(h);
    if (key) {
      col.addEventListener('dragover', function (e) { e.preventDefault(); col.classList.add('is-over'); });
      col.addEventListener('dragleave', function () { col.classList.remove('is-over'); });
      col.addEventListener('drop', function (e) {
        e.preventDefault(); col.classList.remove('is-over');
        var p = e.dataTransfer.getData('text/plain').split(':');
        if (key === 'booked') { var c = data.cards.find(function (x) { return x.kind === p[0] && x.id === Number(p[1]); }); if (c) openBook(c, null); return; }
        act({ op: 'move', kind: p[0], id: Number(p[1]), to: key });
      });
    }
    cards.forEach(function (c) { col.appendChild(card(c)); });
    return col;
  }

  function render() {
    var b = el('board'); b.textContent = '';
    COLS.forEach(function (k) { b.appendChild(column(k[0], k[1], data.cards.filter(function (c) { return c.stage === k[0]; }))); });
    var booked = column('booked', 'Booked', []);
    booked.appendChild(U.node('p', 'panel-note', 'Drop a card here to book it. Booked surveys are on Today and the week.'));
    var link = U.node('a', 'btn btn--ghost btn--sm', 'Open Today'); link.href = '/staff/calendar.html';
    booked.appendChild(link);
    b.appendChild(booked);
  }

  /* Who's free: each day, each surveyor, their open starts. Grouped by
     person so "Tom can do 9, 10 or 2 on Saturday" reads in one line. */
  function renderFree() {
    var list = el('free-days'); list.textContent = '';
    var only = el('free-who').value;
    var days = {};
    (data.free || []).filter(function (s) { return !only || s.surveyor === only; }).forEach(function (s) {
      var d = days[s.date] = days[s.date] || {};
      (d[s.surveyor] = d[s.surveyor] || []).push(s);
    });
    var keys = Object.keys(days).sort();
    if (!keys.length) { list.appendChild(U.node('li', 'panel-note', 'Nobody has set free hours for the next two weeks. Each surveyor sets theirs on My hours.')); return; }
    keys.forEach(function (d) {
      var li = U.node('li', 'free-day');
      li.appendChild(U.node('span', 'free-date', day(d)));
      Object.keys(days[d]).sort().forEach(function (who) {
        var row = U.node('div', 'sched-row free-who');
        row.appendChild(U.node('span', 'free-name', cap(who)));
        days[d][who].forEach(function (s) { row.appendChild(button(s.time, 'sched-chip', function () { openBook(null, s); })); });
        li.appendChild(row);
      });
      list.appendChild(li);
    });
  }
  el('free-who').addEventListener('change', renderFree);
  el('free-go').addEventListener('click', function () { load(); });

  function openBook(c, slot) {
    /* From Who's free there is no card yet: pick who it is for. */
    el('b-for-row').hidden = Boolean(c);
    el('b-new').hidden = Boolean(c);
    if (!c) {
      var f = el('b-for'); f.textContent = '';
      data.cards.forEach(function (x, i) { var o = document.createElement('option'); o.value = String(i); o.textContent = (x.name || 'No name') + (x.postcode ? ', ' + x.postcode : ''); f.appendChild(o); });
      if (!data.cards.length) { el('note').textContent = 'Nobody is waiting on the board. Add the caller with the + button first.'; return; }
      c = data.cards[0];
      f.onchange = function () { booking = data.cards[Number(f.value)]; };
    }
    booking = c;
    el('book-title').textContent = 'Book ' + (c.name || 'survey') + (c.postcode ? ', ' + c.postcode : '');
    el('b-date').value = slot ? slot.date : '';
    el('b-time').value = slot ? slot.time : '';
    if (slot || c.surveyor) el('b-who').value = slot ? slot.surveyor : c.surveyor;
    if (c.surveyType) el('b-type').value = c.surveyType;
    el('b-type').disabled = c.kind === 'job';
    el('b-note').textContent = '';
    el('b-go').textContent = 'Book it';
    el('b-pencil').textContent = 'Pencil in (48h)';
    el('b-go').dataset.force = '';
    el('book').showModal();
  }

  async function submit(op) {
    var force = el('b-go').dataset.force === '1';
    var r = await U.send('/api/admin/scheduling', { op: op, kind: booking.kind, id: booking.id, date: el('b-date').value, time: el('b-time').value, surveyor: el('b-who').value, surveyType: el('b-type').value, force: force });
    el('b-go').dataset.force = '';
    if (r.ok) {
      el('book').close();
      var d = r.data || {};
      el('note').textContent = op === 'pencil'
        ? (d.byHand ? 'Pencilled in, held until someone lets it go (waiting on the agent).' : 'Pencilled in for 48 hours.') + ' It shows grey on Today.'
          + (d.sharing && d.sharing.length ? ' The same time is also offered to ' + d.sharing.join(', ') + '.' : '')
          + (d.recent && d.recent.length ? ' Heads up: ' + d.recent.join('; ') + '.' : '')
        : 'Booked. It is on Today now.' + (d.bumped && d.bumped.length ? ' ' + d.bumped.join(', ') + ' had that time pencilled and went back to Waiting, with a to-do to offer another time.' : '');
      load(); return;
    }
    if (r.data && r.data.clash) { el('b-note').textContent = r.data.clash + ' Go ahead anyway?'; el('b-go').textContent = 'Book anyway'; el('b-pencil').textContent = 'Pencil anyway'; el('b-go').dataset.force = '1'; return; }
    el('b-note').textContent = (r.data && r.data.error) || 'That did not save.';
  }
  el('book-form').addEventListener('submit', function (e) { e.preventDefault(); submit('book'); });
  el('b-pencil').addEventListener('click', function () { submit('pencil'); });
  ['b-date', 'b-time', 'b-who'].forEach(function (id) { el(id).addEventListener('change', function () { el('b-go').dataset.force = ''; el('b-go').textContent = 'Book it'; el('b-pencil').textContent = 'Pencil in (48h)'; }); });
  el('b-cancel').addEventListener('click', function () { el('book').close(); });

  /* The dispatch day: which day and week are on screen, and what its buttons do. */
  var view = { day: '', week: '' };
  var dispatchOpts = {
    get today() { return data && data.today; },
    reload: function () { load(); },
    go: function (d, w) { view.day = d; view.week = w; load(); },
    book: function (c, slot) { openBook(c, slot); },
    focusCard: function (kind, id) { var n = document.getElementById(kind + '-' + id); if (n) { n.scrollIntoView({ block: 'center' }); n.classList.add('is-hit'); } },
    /* A board card dropped on a free start books that card at that time. */
    dropOn: function (ref, slot) {
      var p = String(ref).split(':');
      var c = data.cards.find(function (x) { return x.kind === p[0] && x.id === Number(p[1]); });
      if (c) openBook(c, slot);
    }
  };
  async function load() {
    try {
      var pcode = el('free-pc').value.trim();
      var q = ['day=' + view.day, 'week=' + view.week].filter(function (x) { return !/=$/.test(x); });
      if (pcode) q.push('postcode=' + encodeURIComponent(pcode));
      data = await U.get('/api/admin/scheduling' + (q.length ? '?' + q.join('&') : ''));
      var t = el('b-type');
      if (!t.options.length) data.rates.forEach(function (r) { var o = document.createElement('option'); o.value = r.key; o.textContent = r.label; t.appendChild(o); });
      render();
      renderFree();
      global.DSDISPATCH.render(el('dispatch'), data.dispatch, dispatchOpts);
      global.DSAFTER.render(el('after'), load);
      var hit = (focusAfter && document.getElementById(focusAfter)) || (location.hash && document.getElementById(location.hash.slice(1)));
      focusAfter = null;
      if (hit) { hit.scrollIntoView({ block: 'center' }); hit.classList.add('is-hit'); }
    } catch (e) { if (e.message !== 'unauthorised') el('note').textContent = 'Could not load the board.'; }
  }
  var r = el('refresh'); if (r) r.addEventListener('click', load);
  var o = el('logout'); if (o) o.addEventListener('click', async function () { await fetch('/api/auth/logout', { method: 'POST' }); location.replace('/staff'); });
  load();
})(window);
