/* The working parts of a Scheduling card, shown when the card is opened
   (sched-card.js) so the board itself stays a compact list of names: photos,
   a website pick, the pencilled hold, the same person on another card, the
   times they want, Move to, Book and Close. Every change goes through the
   board's act(), which reloads it; the pop-up closes so nothing goes stale. */
(function (global) {
  'use strict';
  var U = global.DSUI;
  var COLS = [['new', 'New enquiry'], ['contacted', 'Contacted'], ['waiting', 'Waiting for time']];
  var cap = function (s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; };
  function day(d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); }
  function ago(iso) {
    var m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000)), h = Math.round(m / 60);
    return m < 60 ? m + ' min ago' : h < 48 ? h + 'h ago' : Math.round(h / 24) + ' days ago';
  }
  function button(text, cls, fn) { var b = U.node('button', cls || 'btn btn--ghost btn--sm', text); b.type = 'button'; b.addEventListener('click', fn); return b; }

  /* Fills `box` with the card's working parts. done() closes the pop-up. */
  var closeBox = null;
  function fill(box, c, opts, done) {
    closeBox = null;
    var act = function (body, said) { done(); return opts.act(body, said); };
    var book = function (slot) { done(); opts.book(c, slot); };
    /* Booking is the main thing a card is for: a day, a time and who, then it is on Today. */
    var go = button('Book it in', 'btn sched-bookit', function () { book(null); });
    box.appendChild(go);
    var main = U.node('div', 'sched-row');
    var move = document.createElement('select'); move.setAttribute('aria-label', 'Move to');
    /* Every next step from here, warm or cold: the board columns, booked, or not going ahead. */
    COLS.concat([['cold', 'Gone cold (try later)'], ['booked', 'Booked (pick a day and time)'], ['close', 'Not going ahead']]).forEach(function (k) { if (c.kind === 'job' && k[0] === 'new') return; var o = document.createElement('option'); o.value = k[0]; o.textContent = 'Move to: ' + k[1]; if (k[0] === c.stage) o.selected = true; move.appendChild(o); });
    move.addEventListener('change', function () {
      if (move.value === 'booked') book(null);
      else if (move.value === 'close') { if (closeBox) { closeBox.open = true; closeBox.scrollIntoView({ behavior: 'smooth', block: 'center' }); } move.value = c.stage; }
      else act({ op: 'move', kind: c.kind, id: c.id, to: move.value });
    });
    main.appendChild(move);
    box.appendChild(main);
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
      pr.appendChild(button('They said yes: book it', 'btn btn--sm', function () { book(pc); }));
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
    box.appendChild(U.node('h3', null, 'Times they want'));
    var want = U.node('div', 'sched-row');
    var wi = document.createElement('input'); wi.placeholder = 'e.g. Sat mornings'; wi.value = c.wanted || ''; wi.setAttribute('aria-label', 'Times they want');
    want.appendChild(wi);
    want.appendChild(button('Save', null, function () { act({ op: 'wanted', kind: c.kind, id: c.id, text: wi.value }, 'Times saved for ' + (c.name || 'the card') + '.'); }));
    box.appendChild(want);
    /* Closing is folded away at the very end so it is never tapped by mistake. */
    {
      var fold = document.createElement('details'); fold.className = 'sched-closefold';
      fold.appendChild(U.node('summary', null, 'Not going ahead? Close it'));
      var shut = U.node('div', 'sched-row sched-close');
      var why = document.createElement('select'); why.setAttribute('aria-label', 'Why close it');
      ['Booked elsewhere', 'Not interested', 'No answer', 'Already sorted', 'Spam', 'Other'].forEach(function (w) { var o = document.createElement('option'); o.value = w; o.textContent = w; why.appendChild(o); });
      shut.appendChild(why);
      shut.appendChild(button('Close', null, function () { act({ op: 'close', kind: c.kind, id: c.id, reason: why.value }, (c.name || 'Customer') + ' closed: ' + why.value + (c.kind === 'lead' ? '. It stays on the Leads page.' : '. The job is kept as cancelled.')); }));
      fold.appendChild(shut);
      closeBox = fold;
    }
  }

  /* The close fold, for the pop-up to put at its very end. */
  global.DSSCHEDDETAIL = { fill: fill, closeBox: function () { return closeBox; } };
})(window);
