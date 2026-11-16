/* A customer's to-dos, the same in the Today pop-up, the client card and the
   Scheduling card. Calm rows (the owner's clean-up, 16 Nov 2026): a round tick
   and the words, one line to add with + inside it. Ones the facts look to
   have done (opts.maybe) come first with a "Looks done" tag and one Clear
   these, since the owners chose to be asked rather than have a person's
   to-dos cleared for them; each to-do is shown once. */
(function (global) {
  'use strict';
  var U = global.DSUI;
  var TICK = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var PLUS = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';

  function row(x, changed, looksDone) {
    var r = U.node('div', 'td-row' + (looksDone ? ' is-maybe' : ''));
    var b = U.node('button', 'td-tick'); b.type = 'button'; b.innerHTML = TICK; b.setAttribute('aria-label', 'Done: ' + x.text);
    b.addEventListener('click', async function () {
      b.disabled = true; r.classList.add('is-done');
      try { await U.send('/api/admin/todos', { op: 'done', id: x.id }); } catch (e) { r.classList.remove('is-done'); b.disabled = false; return; }
      var W = global.DSWORK;
      if (W && W.offerUndo) W.offerUndo('To-do ticked off.', function () { return U.send('/api/admin/todos', { op: 'reopen', id: x.id }); }, changed);
      setTimeout(changed, 220);
    });
    var t = U.node('span', 'td-text', x.text);
    if (x.forName) t.appendChild(U.node('small', null, ' · ' + x.forName));
    r.appendChild(b); r.appendChild(t);
    if (looksDone) r.appendChild(U.node('span', 'c-tag is-good', 'Looks done'));
    return r;
  }

  /* jobId is a job's id, or {leadId} for an enquiry not booked yet (the Scheduling card). */
  function render(mount, jobId, todos, changed, opts) {
    var ref = jobId && typeof jobId === 'object' ? jobId : { jobId: jobId };
    var maybe = (opts && opts.maybe) || [];
    mount.textContent = '';
    var list = U.node('div', 'td-list');
    maybe.forEach(function (x) { list.appendChild(row(x, changed, true)); });
    (todos || []).forEach(function (x) { list.appendChild(row(x, changed, false)); });
    if (list.children.length) mount.appendChild(list);
    if (maybe.length > 1) {
      var clear = U.node('button', 'c-link td-clear', 'Clear the ' + maybe.length + ' that look done'); clear.type = 'button';
      clear.addEventListener('click', async function () {
        clear.disabled = true;
        for (var i = 0; i < maybe.length; i += 1) await U.send('/api/admin/todos', { op: 'done', id: maybe[i].id });
        changed();
      });
      mount.appendChild(clear);
    }

    var form = U.node('form', 'td-add');
    var input = document.createElement('input');
    input.type = 'text'; input.placeholder = 'Add a to-do'; input.maxLength = 2000;
    input.setAttribute('aria-label', 'New to-do for this customer');
    var who = document.createElement('select');
    who.setAttribute('aria-label', 'For');
    [['', 'Everyone'], ['owners', 'Owners']].forEach(function (o) { var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; who.appendChild(op); });
    var add = U.node('button', 'td-plus'); add.type = 'submit'; add.innerHTML = PLUS; add.setAttribute('aria-label', 'Add');
    var err = U.node('span', 'err');
    form.appendChild(input); form.appendChild(who); form.appendChild(add);
    form.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      if (!input.value.trim()) { input.focus(); return; }
      add.disabled = true;
      try {
        var r = await U.send('/api/admin/todos', Object.assign({ op: 'add', text: input.value.trim(), forPersonId: who.value || null }, ref));
        if (!r.ok) throw new Error((r.data && r.data.error) || 'Could not add it.');
        input.value = '';
        changed();
      } catch (e) {
        err.textContent = /Request failed/.test(e.message) ? 'Only managers can add to-dos.' : e.message;
        err.classList.add('is-shown');
      }
      add.disabled = false;
    });
    /* On the Scheduling card the add box is one tap away, so the card stays calm. */
    if (opts && opts.fold) {
      var f = document.createElement('details'); f.className = 'todo-addfold';
      f.appendChild(U.node('summary', null, '+ Add a to-do'));
      f.appendChild(form); f.appendChild(err); mount.appendChild(f);
    } else { mount.appendChild(form); mount.appendChild(err); }
  }

  /* A small "1 to-do" tag for a card. */
  function tag(n) {
    if (!n) return null;
    return U.node('span', 'tag todo-tag', n + ' to-do' + (n === 1 ? '' : 's'));
  }

  global.DSTODOS = { render: render, tag: tag };
})(window);
