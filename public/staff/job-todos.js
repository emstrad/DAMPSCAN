/* A job's to-dos, the same in the Today pop-up and the client card: each
   open one with a tick box (Undo through the caller's changed()), and a box
   to add one for this customer without going through ChatGPT. */
(function (global) {
  'use strict';
  var U = global.DSUI;

  function render(mount, jobId, todos, changed) {
    mount.textContent = '';
    (todos || []).forEach(function (x) {
      var l = U.node('label', 'sheet-tick');
      var box = document.createElement('input');
      box.type = 'checkbox';
      box.addEventListener('change', async function () {
        box.disabled = true;
        try { await U.send('/api/admin/todos', { op: 'done', id: x.id }); } catch (e) { box.checked = false; box.disabled = false; return; }
        var W = global.DSWORK;
        if (W && W.offerUndo) W.offerUndo('To-do ticked off.', function () { return U.send('/api/admin/todos', { op: 'reopen', id: x.id }); }, changed);
        changed();
      });
      l.appendChild(box);
      l.appendChild(U.node('span', null, x.text + (x.forName ? ' (' + x.forName + ')' : '')));
      mount.appendChild(l);
    });


    var form = U.node('form', 'todo-add');
    var input = document.createElement('input');
    input.type = 'text'; input.placeholder = 'Add a to-do for this customer'; input.maxLength = 2000;
    input.setAttribute('aria-label', 'New to-do for this customer');
    var who = document.createElement('select');
    who.setAttribute('aria-label', 'For');
    [['', 'Everyone'], ['owners', 'Owners']].forEach(function (o) { var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; who.appendChild(op); });
    var add = U.node('button', 'btn btn--ghost btn--sm', 'Add');
    add.type = 'submit';
    var err = U.node('span', 'err');
    form.appendChild(input); form.appendChild(who); form.appendChild(add); form.appendChild(err);
    form.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      if (!input.value.trim()) return;
      add.disabled = true;
      try {
        var r = await U.send('/api/admin/todos', { op: 'add', text: input.value.trim(), jobId: jobId, forPersonId: who.value || null });
        if (!r.ok) throw new Error((r.data && r.data.error) || 'Could not add it.');
        input.value = '';
        changed();
      } catch (e) {
        err.textContent = /Request failed/.test(e.message) ? 'Only managers can add to-dos.' : e.message;
        err.classList.add('is-shown');
      }
      add.disabled = false;
    });
    mount.appendChild(form);
  }

  /* A small "1 to-do" tag for a card. */
  function tag(n) {
    if (!n) return null;
    return U.node('span', 'tag todo-tag', '📝 ' + n + ' to-do' + (n === 1 ? '' : 's'));
  }

  global.DSTODOS = { render: render, tag: tag };
})(window);
