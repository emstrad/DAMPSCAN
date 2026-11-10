/* The shared to-do list. Most items arrive from people's assistants; this is
   where they are read, ticked off and added by hand. Under a company it shows
   that company's to-dos plus the general ones; from the top bar, everything
   the person can see. The words are shown exactly as they were said. */
(function (global) {
  'use strict';

  var U = global.DSUI;
  var A = global.DSAREA || { sites: [] };
  var el = function (id) { return document.getElementById(id); };
  var NAME = { dampscan: 'DampScan', 'ati-london': 'ATi', roofing: 'Verge Roofing', ac: 'CoolRight' };
  var state = { view: 'open', people: [], filled: false };

  function day(iso) {
    return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  }

  /* How long it has been waiting: "Waiting 3 days", "Waiting 5 hours". */
  function waiting(iso) {
    var mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
    if (mins < 60) return 'Waiting ' + mins + ' min';
    var hours = Math.round(mins / 60);
    if (hours < 24) return 'Waiting ' + hours + (hours === 1 ? ' hour' : ' hours');
    var days = Math.floor(hours / 24);
    return 'Waiting ' + days + (days === 1 ? ' day' : ' days');
  }

  function meta(t) {
    var bits = [];
    if (!t.doneAt) bits.push(waiting(t.createdAt));
    if (state.view === 'set' || state.view === 'done') bits.push('For ' + t.forName);
    bits.push((t.source === 'failed' ? 'Assistant could not do this for ' : 'Set by ') + t.setBy + ', ' + U.when(t.createdAt));
    if (t.site) bits.push(NAME[t.site] || t.site);
    if (t.customer) bits.push(t.customer);
    else if (t.lead) bits.push(t.lead);
    if (t.doneAt) bits.push('Done by ' + t.doneBy + ', ' + U.when(t.doneAt));
    return bits.join(' · ');
  }

  function row(t) {
    var li = U.node('li', t.doneAt ? 'is-done' : null);
    var box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = Boolean(t.doneAt);
    box.setAttribute('aria-label', (t.doneAt ? 'Reopen: ' : 'Done: ') + t.text.slice(0, 60));
    box.addEventListener('change', async function () {
      box.disabled = true;
      try { await U.send('/api/admin/todos', { op: box.checked ? 'done' : 'reopen', id: t.id }); } catch (e) { box.checked = !box.checked; }
      load();
    });
    var body = U.node('div');
    body.appendChild(U.node('p', 'todo-words', t.text));
    var m = U.node('p', 'todo-meta', meta(t));
    if (t.dueOn && !t.doneAt) {
      m.appendChild(document.createTextNode(' · '));
      m.appendChild(U.node('span', t.overdue ? 'is-overdue' : null, (t.overdue ? 'Overdue: ' : 'Due ') + day(t.dueOn)));
    }
    body.appendChild(m);
    if (t.jobId) {
      var a = U.node('a', 'todo-meta', 'Open the job');
      a.href = '/staff/quoted.html#job-' + t.jobId;
      if (t.site === 'dampscan' || t.site === 'ati-london') a.href = '/staff/jobs.html#job-' + t.jobId;
      body.appendChild(a);
    } else if (t.leadId) {
      var e = U.node('a', 'todo-meta', 'Open ' + (t.customer || 'their card'));
      e.href = '/staff/schedule.html?area=damp#lead-' + t.leadId;
      body.appendChild(e);
    }
    li.appendChild(box);
    li.appendChild(body);
    return li;
  }

  function fillPeople(people, me, owners) {
    if (state.filled) return;
    state.filled = true;
    var sel = el('for');
    /* The owners' code has no row in the people list, so its own list is
       offered by name and chosen by default, as "me" is for anyone else. */
    if (owners) {
      var mine = document.createElement('option');
      mine.value = 'owners';
      mine.textContent = owners + ' (me)';
      sel.insertBefore(mine, sel.firstChild);
      sel.value = 'owners';
    }
    people.forEach(function (p) {
      var o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.id === me ? p.name + ' (me)' : p.name;
      sel.appendChild(o);
    });
  }

  async function load() {
    el('state').hidden = false;
    el('state').textContent = 'Loading…';
    try {
      var data = await U.get('/api/admin/todos?view=' + state.view);
      fillPeople(data.people || [], data.me, data.owners);
      /* Under one company, its to-dos and the general ones only. */
      var todos = (data.todos || []).filter(function (t) { return !A.sites.length || !t.site || A.sites.indexOf(t.site) !== -1; });
      var list = el('list');
      list.textContent = '';
      todos.forEach(function (t) { list.appendChild(row(t)); });
      el('state').textContent = 'Nothing here.';
      el('state').hidden = todos.length > 0;
    } catch (e) {
      el('state').textContent = e.message || 'Could not load.';
    }
  }

  document.querySelectorAll('[data-view]').forEach(function (b) {
    b.addEventListener('click', function () {
      state.view = b.getAttribute('data-view');
      document.querySelectorAll('[data-view]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      load();
    });
  });

  el('add').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var note = el('add-note');
    var body = { op: 'add', text: el('text').value, forPersonId: el('for').value || null, dueOn: el('due').value || null };
    if (A.sites.length === 1) body.site = A.sites[0];
    try {
      var r = await U.send('/api/admin/todos', body);
      if (!r.ok) { note.textContent = (r.data && r.data.error) || 'Could not add that.'; return; }
      note.textContent = 'Added.';
      el('text').value = '';
      el('due').value = '';
      load();
    } catch (e) {
      note.textContent = e.message || 'Could not add that.';
    }
  });

  el('refresh').addEventListener('click', load);
  el('logout').addEventListener('click', async function () {
    await fetch('/api/auth/logout', { method: 'POST' });
    location.replace('/staff');
  });
  load();
})(window);
