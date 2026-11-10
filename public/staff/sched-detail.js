/* The working parts of a Scheduling card, built for the customer card
   (sched-card.js) to place: what needs a decision now (a website pick, the
   pencilled hold, the same person on another card), photos, the times they
   want, and Move to with Close folded at its end. Every change goes through
   the board's act(), which reloads it; the pop-up closes so nothing goes stale. */
(function (global) {
  'use strict';
  var U = global.DSUI;
  var COLS = [['new', 'New enquiry'], ['contacted', 'Contacted'], ['waiting', 'Waiting for time'], ['cold', 'Gone cold (try later)'], ['booked', 'Booked (pick a day and time)']];
  var cap = function (s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; };
  function day(d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); }
  function ago(iso) {
    var m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000)), h = Math.round(m / 60);
    return m < 60 ? m + ' min ago' : h < 48 ? h + 'h ago' : Math.round(h / 24) + ' days ago';
  }
  function button(text, cls, fn) { var b = U.node('button', cls || 'btn btn--ghost btn--sm', text); b.type = 'button'; b.addEventListener('click', fn); return b; }

  /* What needs a decision before anything else: shown at the top of the card. */
  function urgent(c, act, book) {
    var out = [];
    if (c.held) out.push(U.node('p', 'meta', 'Picked on the website ' + new Date(c.held.at).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' with ' + cap(c.held.surveyor)));
    if (c.pencil) {
      var pc = c.pencil;
      var pen = U.node('div', 'sched-pencil');
      pen.appendChild(U.node('b', null, 'Pencilled ' + day(pc.date) + ', ' + pc.time + ', ' + cap(pc.surveyor)));
      pen.appendChild(U.node('p', 'meta', (pc.byHand ? 'Held until let go (waiting on the agent)' : 'Held until ' + new Date(pc.until).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit' }))
        + (pc.by ? ' · by ' + pc.by + (pc.setAt ? ', ' + ago(pc.setAt) : '') : '')));
      if (pc.sharing && pc.sharing.length) pen.appendChild(U.node('p', 'tl-clash', 'Also offered to ' + pc.sharing.join(', ') + ': first yes gets it.'));
      var pr = U.node('div', 'sched-row');
      pr.appendChild(button('They said yes: book it', 'btn btn--sm', function () { book(pc); }));
      pr.appendChild(button('Let it go', null, function () { act({ op: 'unpencil', kind: c.kind, id: c.id }); }));
      pen.appendChild(pr);
      out.push(pen);
    }
    /* The same person on another card: link the enquiry to the job, or close the spare enquiry. */
    (c.same || []).forEach(function (o) {
      var dup = U.node('div', 'sched-pencil');
      dup.appendChild(U.node('p', 'tl-clash', 'Same person as ' + (o.name || 'another card') + (o.postcode ? ', ' + o.postcode : '') + (o.kind === 'lead' ? ' (enquiry)' : ' (job)') + '?'));
      var dr = U.node('div', 'sched-row');
      if (c.kind === 'job' && o.kind === 'lead') dr.appendChild(button('Link their enquiry', 'btn btn--sm', function () { act({ op: 'link', kind: 'job', id: c.id, leadId: o.id }); }));
      if (c.kind === 'lead') dr.appendChild(button('Close this one as a duplicate', null, function () { act({ op: 'close_dup', kind: 'lead', id: c.id }); }));
      dup.appendChild(dr);
      out.push(dup);
    });
    return out;
  }

  function photos(c) {
    if (!c.files || !c.files.length) return null;
    var pics = U.node('div', 'sched-files');
    c.files.forEach(function (path) {
      var a = U.node('a', 'sched-file'); a.href = '/api/admin/attachment?path=' + encodeURIComponent(path); a.target = '_blank'; a.rel = 'noopener';
      var name = path.split('/').pop().replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '');
      if (/\.(jpe?g|png|gif|webp|heic)$/i.test(name)) { var img = document.createElement('img'); img.src = a.href; img.alt = 'Photo: ' + name; img.loading = 'lazy'; a.appendChild(img); }
      else a.textContent = name;
      pics.appendChild(a);
    });
    return pics;
  }

  function wanted(c, act) {
    var want = U.node('div', 'sched-row');
    var wi = document.createElement('input'); wi.placeholder = 'Times they want, e.g. Sat mornings'; wi.value = c.wanted || ''; wi.setAttribute('aria-label', 'Times they want');
    want.appendChild(wi);
    want.appendChild(button('Save', null, function () { act({ op: 'wanted', kind: c.kind, id: c.id, text: wi.value }, 'Times saved for ' + (c.name || 'the card') + '.'); }));
    return want;
  }

  /* Move to, with Not going ahead last and its reason asked first, so it is never tapped by mistake. */
  function move(c, act, book) {
    var box = U.node('div');
    var row = U.node('div', 'sched-row');
    var sel = document.createElement('select'); sel.setAttribute('aria-label', 'Move to');
    COLS.forEach(function (k) {
      if (c.kind === 'job' && k[0] === 'new') return;
      var o = document.createElement('option'); o.value = k[0]; o.textContent = k[1]; if (k[0] === c.stage) o.selected = true; sel.appendChild(o);
    });
    row.appendChild(sel);
    row.appendChild(button('Move', 'btn btn--sm', function () {
      if (sel.value === c.stage) return;
      if (sel.value === 'booked') book(null); else act({ op: 'move', kind: c.kind, id: c.id, to: sel.value });
    }));
    box.appendChild(row);
    box.appendChild(U.node('p', 'meta', 'Not going ahead'));
    var shut = U.node('div', 'sched-row');
    var why = document.createElement('select'); why.setAttribute('aria-label', 'Why it is not going ahead');
    ['Booked elsewhere', 'Not interested', 'No answer', 'Already sorted', 'Spam', 'Other'].forEach(function (w) { var o = document.createElement('option'); o.value = w; o.textContent = w; why.appendChild(o); });
    shut.appendChild(why);
    shut.appendChild(button('Close', null, function () { act({ op: 'close', kind: c.kind, id: c.id, reason: why.value }, (c.name || 'Customer') + ' closed: ' + why.value + (c.kind === 'lead' ? '. It stays on the Leads page.' : '. The job is kept as cancelled.')); }));
    box.appendChild(shut);
    return box;
  }

  global.DSSCHEDDETAIL = { urgent: urgent, photos: photos, wanted: wanted, move: move };
})(window);
