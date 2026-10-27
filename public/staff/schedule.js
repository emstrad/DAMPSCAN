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
  function ago(iso) { var h = Math.round((Date.now() - new Date(iso).getTime()) / 3600000); return h < 48 ? h + 'h ago' : Math.round(h / 24) + ' days ago'; }

  async function act(body) {
    var r = await U.send('/api/admin/scheduling', body);
    el('note').textContent = r.ok ? '' : (r.data && r.data.error) || 'That did not save.';
    if (r.ok) load();
    return r;
  }

  function button(text, cls, fn) { var b = U.node('button', cls || 'btn btn--ghost btn--sm', text); b.type = 'button'; b.addEventListener('click', fn); return b; }

  function card(c) {
    var box = U.node('article', 'sched-card');
    box.draggable = true;
    box.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', c.kind + ':' + c.id); });
    box.appendChild(U.node('h3', null, (c.name || 'No name') + (c.postcode ? ', ' + c.postcode : '')));
    var bits = [c.site === 'ati-london' ? 'ATi' : 'DampScan', c.kind === 'lead' ? 'website enquiry ' + ago(c.since) : 'job, no time yet'];
    if (c.awaitingAgent) bits.push('waiting on ' + (c.agent || 'the agent'));
    if (c.deadline) bits.push('report needed by ' + c.deadline);
    box.appendChild(U.node('p', 'meta', bits.join(' · ')));
    var contact = U.node('div', 'sched-row');
    if (c.phone) { var a = U.node('a', 'btn btn--ghost btn--sm', 'Call ' + c.phone); a.href = 'tel:' + c.phone; contact.appendChild(a); }
    if (c.email) { var m = U.node('a', 'btn btn--ghost btn--sm', 'Email'); m.href = 'mailto:' + c.email; contact.appendChild(m); }
    box.appendChild(contact);
    if (c.wanted) box.appendChild(U.node('p', 'meta', 'Wants: ' + c.wanted));
    if (c.held) box.appendChild(U.node('p', 'meta', 'Picked on the website: ' + new Date(c.held.at).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' with ' + cap(c.held.surveyor)));
    if (c.log.length) {
      var ul = U.node('ul');
      c.log.slice(-4).reverse().forEach(function (x) { ul.appendChild(U.node('li', null, (HOW.find(function (h) { return h[0] === x.how; }) || ['', 'Note'])[1] + ' by ' + x.by + ', ' + ago(x.at) + (x.note ? ': ' + x.note : ''))); });
      box.appendChild(ul);
    }
    /* Log a contact: what happened and an optional line about it. */
    var log = U.node('div', 'sched-row');
    var how = document.createElement('select'); how.setAttribute('aria-label', 'What happened');
    HOW.forEach(function (h) { var o = document.createElement('option'); o.value = h[0]; o.textContent = h[1]; how.appendChild(o); });
    var said = document.createElement('input'); said.placeholder = 'What was said'; said.setAttribute('aria-label', 'What was said');
    log.appendChild(how); log.appendChild(said);
    log.appendChild(button('Log', null, function () { act({ op: 'log', kind: c.kind, id: c.id, how: how.value, note: said.value }); }));
    box.appendChild(log);
    var want = U.node('div', 'sched-row');
    var wi = document.createElement('input'); wi.placeholder = 'Times they want, e.g. Sat mornings'; wi.value = c.wanted || ''; wi.setAttribute('aria-label', 'Times they want');
    want.appendChild(wi);
    want.appendChild(button('Save', null, function () { act({ op: 'wanted', kind: c.kind, id: c.id, text: wi.value }); }));
    box.appendChild(want);
    /* The next free times from the surveyors' own hours: a tap fills the booking. */
    var chips = U.node('div', 'sched-row');
    data.slots.slice(0, 4).forEach(function (s) {
      chips.appendChild(button(day(s.date) + ' ' + s.time + ' ' + cap(s.surveyor), 'sched-chip', function () { openBook(c, s); }));
    });
    box.appendChild(chips);
    var end = U.node('div', 'sched-row');
    var move = document.createElement('select'); move.setAttribute('aria-label', 'Move to');
    COLS.forEach(function (k) { if (c.kind === 'job' && k[0] === 'new') return; var o = document.createElement('option'); o.value = k[0]; o.textContent = 'Move to: ' + k[1]; if (k[0] === c.stage) o.selected = true; move.appendChild(o); });
    move.addEventListener('change', function () { act({ op: 'move', kind: c.kind, id: c.id, to: move.value }); });
    end.appendChild(move);
    end.appendChild(button('Book', 'btn btn--sm', function () { openBook(c, null); }));
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

  function openBook(c, slot) {
    booking = c;
    el('book-title').textContent = 'Book ' + (c.name || 'survey') + (c.postcode ? ', ' + c.postcode : '');
    el('b-date').value = slot ? slot.date : '';
    el('b-time').value = slot ? slot.time : '';
    if (slot || c.surveyor) el('b-who').value = slot ? slot.surveyor : c.surveyor;
    if (c.surveyType) el('b-type').value = c.surveyType;
    el('b-type').disabled = c.kind === 'job';
    el('b-note').textContent = '';
    el('b-go').textContent = 'Book it';
    el('book').showModal();
  }

  el('book-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var force = el('b-go').dataset.force === '1';
    var r = await U.send('/api/admin/scheduling', { op: 'book', kind: booking.kind, id: booking.id, date: el('b-date').value, time: el('b-time').value, surveyor: el('b-who').value, surveyType: el('b-type').value, force: force });
    el('b-go').dataset.force = '';
    if (r.ok) { el('book').close(); el('note').textContent = 'Booked. It is on Today now.'; load(); return; }
    if (r.data && r.data.clash) { el('b-note').textContent = r.data.clash + ' Book anyway?'; el('b-go').textContent = 'Book anyway'; el('b-go').dataset.force = '1'; return; }
    el('b-note').textContent = (r.data && r.data.error) || 'That did not book.';
  });
  ['b-date', 'b-time', 'b-who'].forEach(function (id) { el(id).addEventListener('change', function () { el('b-go').dataset.force = ''; el('b-go').textContent = 'Book it'; }); });
  el('b-cancel').addEventListener('click', function () { el('book').close(); });

  async function load() {
    try {
      data = await U.get('/api/admin/scheduling');
      var t = el('b-type');
      if (!t.options.length) data.rates.forEach(function (r) { var o = document.createElement('option'); o.value = r.key; o.textContent = r.label; t.appendChild(o); });
      render();
    } catch (e) { if (e.message !== 'unauthorised') el('note').textContent = 'Could not load the board.'; }
  }
  var r = el('refresh'); if (r) r.addEventListener('click', load);
  var o = el('logout'); if (o) o.addEventListener('click', async function () { await fetch('/api/auth/logout', { method: 'POST' }); location.replace('/staff'); });
  load();
})(window);
