/* Client cards: one per booked job, joined to the enquiry it came from.
   The grid is the list; a card opens a dialog with everything on it and the
   two payment boxes. Plain DOM, same as the rest of the staff area. */
(function (global) {
  'use strict';

  var U = global.DSUI;
  var D = global.DSCLIENTDIALOG;   // client-dialog.js: the big view of one client
  var SITE = D.SITE;
  var addressLines = D.addressLines;
  var fillDialog = D.fill;
  var el = function (id) { return document.getElementById(id); };

  var state = { site: '', view: 'upcoming', clients: [], open: null, opener: null,
    query: '', all: null };   // `all` caches every client, fetched the first time a search needs it

  /* "Thu 10 Sep" for a date, "Today" and "Tomorrow" where they apply, since a
     surveyor scanning the board wants to know that faster than a date. */
  function day(iso) {
    if (!iso) return 'No date';
    var d = new Date(iso + 'T00:00:00');
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var diff = Math.round((d - today) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    /* Built by hand rather than toLocaleDateString, which gives "Thu, 10 Sept"
       in en-GB: a comma a card does not want and a month that is not "Sep". */
    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return days[d.getDay()] + ' ' + d.getDate() + ' ' + months[d.getMonth()]
      + (d.getFullYear() !== today.getFullYear() ? ' ' + d.getFullYear() : '');
  }

  /* ---------- the grid ---------- */
  function card(c) {
    var b = U.node('button', 'ccard');
    b.type = 'button';
    b.dataset.id = String(c.id);
    b.setAttribute('aria-haspopup', 'dialog');

    var top = U.node('div', 'ccard-top');
    top.appendChild(U.node('span', 'ccard-when', day(c.surveyDate)));
    top.appendChild(U.node('span', 'tag ' + (c.site === 'ati-london' ? 'tag--accent' : 'tag--muted'), SITE[c.site] || c.site));
    b.appendChild(top);

    b.appendChild(U.node('span', 'ccard-name', c.name || 'No name'));
    var addr = addressLines(c);
    b.appendChild(U.node('span', 'ccard-addr', addr.length ? addr.join(', ') : 'No address on file'));
    b.appendChild(U.node('span', 'ccard-survey', c.survey.label + ' · ' + U.money(c.survey.pricePence)));

    var chips = U.node('div', 'ccard-chips');
    chips.appendChild(U.node('span', 'tag ' + (c.money.depositPaidAt ? 'tag--good' : ''),
      c.money.depositPaidAt ? 'Deposit paid' : 'Deposit ' + U.money(c.money.depositPence)));
    chips.appendChild(U.node('span', 'tag ' + (c.money.paidAt ? 'tag--good' : ''),
      c.money.paidAt ? 'Paid in full' : 'Balance ' + U.money(c.money.balancePence)));
    if (c.files.length) chips.appendChild(U.node('span', 'tag tag--muted', c.files.length === 1 ? '1 file' : c.files.length + ' files'));
    if (c.status === 'completed') chips.appendChild(U.node('span', 'tag tag--muted', 'Completed'));
    /* Archived by the calendar but never marked done: it wants either
       completing on the Jobs page or a new date, and the chip says so. */
    else if (c.archived) chips.appendChild(U.node('span', 'tag tag--warn', 'Date passed, not marked done'));
    b.appendChild(chips);

    b.addEventListener('click', function () { open(c, b); });
    return b;
  }

  /* ---------- search ---------- */
  var squash = function (s) { return String(s || '').toLowerCase().replace(/\s+/g, ''); };

  /* Everything a person might type to find a card, as one lowercase string,
     plus a copy with the spaces removed so "n13gz" finds "N1 3GZ" and
     "07700900123" finds "07700 900123". */
  function haystack(c) {
    var bits = [c.name, c.email, c.phone, c.address.line1, c.address.line2, c.address.town,
      c.address.postcode, c.survey.label, c.survey.surveyor, c.note]
      .filter(Boolean).join(' ').toLowerCase();
    return { text: bits, tight: bits.replace(/\s+/g, '') };
  }

  function matches(c, query) {
    var hay = haystack(c);
    /* Every word typed has to be found somewhere: "priya london" narrows,
       it does not widen. */
    return query.toLowerCase().split(/\s+/).filter(Boolean).every(function (tok) {
      return hay.text.indexOf(tok) !== -1 || hay.tight.indexOf(squash(tok)) !== -1;
    });
  }

  function shown() {
    if (!state.query) return state.clients;
    return (state.all || []).filter(function (c) { return matches(c, state.query); });
  }

  function render() {
    var mount = el('cards');
    mount.textContent = '';
    var list = shown();
    if (!list.length) {
      var empty = {
        upcoming: 'No surveys coming up. Save a job as booked on the Jobs page and it appears here.',
        archive: 'Nothing archived yet. A card moves here the day after its survey date, or when the job is marked completed.',
        all: 'No clients yet.'
      };
      mount.appendChild(U.node('p', 'empty', state.query
        ? 'Nobody matches "' + state.query + '". Names, addresses, postcodes, emails and phone numbers all count.'
        : (empty[state.view] || empty.all)));
    }
    list.forEach(function (c) { mount.appendChild(card(c)); });

    var due = list.filter(function (c) { return !c.money.paidAt; }).length;
    var count = U.num(list.length) + (list.length === 1 ? ' client' : ' clients');
    el('summary').textContent = state.query
      ? (list.length ? count + ' matching, searched across upcoming and archived' : '')
      : (list.length ? count + (due ? ', ' + U.num(due) + ' with money still to come' : ', all paid') : '');
  }

  function open(c, opener) {
    state.open = c;
    state.opener = opener;
    fillDialog(c);
    el('client-dialog').showModal();
  }

  async function save(e) {
    e.preventDefault();
    var c = state.open;
    if (!c) return;
    el('client-error').classList.remove('is-shown');
    el('c-save').disabled = true;

    /* Only what changed goes over the wire. A box that was not touched is not
       sent at all, so a dialog left open while a payment webhook ticked the
       same box cannot untick it on save. This is what makes it safe to
       automate the boxes later without the dashboard fighting the automation. */
    var body = { id: c.id };
    var deposit = el('c-deposit').checked;
    var paid = el('c-paid').checked;
    if (deposit !== Boolean(c.money.depositPaidAt)) body.depositPaid = deposit;
    if (paid !== Boolean(c.money.paidAt)) body.paid = paid;
    var date = el('c-date').value || null;
    if (date !== (c.surveyDate || null)) body.jobDate = date;
    var note = el('c-note').value.trim();
    if (note !== (c.note || '')) body.note = note;

    if (Object.keys(body).length === 1) {
      el('c-save').disabled = false;
      el('c-saved').textContent = 'Nothing to save';
      return;
    }

    var res = await U.send('/api/admin/clients', body);
    el('c-save').disabled = false;

    if (!res.ok) {
      var errors = (res.data && res.data.errors) || {};
      var first = Object.keys(errors)[0];
      var err = el('client-error');
      err.textContent = first ? errors[first] : 'That could not be saved.';
      err.classList.add('is-shown');
      return;
    }

    /* Swap the fresh card in where the old one was, and redraw the dialog from
       it so the "on <date>" beside a box reflects what was actually stored. */
    var fresh = res.data.client;
    var swap = function (x) { return x.id === fresh.id ? fresh : x; };
    state.clients = state.clients.map(swap);
    if (state.all) state.all = state.all.map(swap);
    state.open = fresh;
    fillDialog(fresh);
    render();
    el('c-saved').textContent = 'Saved';
  }

  /* ---------- loading and wiring ---------- */
  async function refresh() {
    var siteQs = state.site ? '&site=' + state.site : '';
    try {
      var data = await U.get('/api/admin/clients?view=' + state.view + siteQs);
      state.clients = data.clients || [];
      /* A refresh is also the moment a stale search cache goes. It is refetched
         on the next keystroke that needs it. */
      state.all = null;
      if (state.query) state.all = (await U.get('/api/admin/clients?view=all' + siteQs)).clients || [];
      render();
      el('state').hidden = true;
      el('content').hidden = false;
    } catch (err) {
      el('state').textContent = err.message || 'Could not load clients.';
      el('state').hidden = false;
    }
  }

  function pills(selector, key) {
    document.querySelectorAll(selector).forEach(function (pill) {
      pill.addEventListener('click', function () {
        state[key] = pill.dataset[key];
        document.querySelectorAll(selector).forEach(function (p) {
          p.setAttribute('aria-pressed', String(p === pill));
        });
        refresh();
      });
    });
  }
  pills('[data-site]', 'site');
  pills('[data-view]', 'view');

  /* Typing searches every client on the chosen site, whatever view is
     pressed: a name is a name whether the survey is next week or last year.
     Fetched once per site and reused per keystroke; a short debounce so a
     fast typist is not rendering on every letter. */
  var searchTimer = 0;
  el('search').addEventListener('input', function () {
    clearTimeout(searchTimer);
    var q = el('search').value.trim();
    searchTimer = setTimeout(async function () {
      state.query = q;
      if (q && !state.all) {
        try {
          state.all = (await U.get('/api/admin/clients?view=all' + (state.site ? '&site=' + state.site : ''))).clients || [];
        } catch (err) {
          state.all = [];
        }
      }
      render();
    }, 120);
  });

  el('client-form').addEventListener('submit', save);
  el('client-dialog').addEventListener('close', function () {
    /* Focus goes back to the card that opened it, so a keyboard user is where
       they were rather than at the top of the page. Looked up by id rather
       than held as an element, because a save redraws the grid and the button
       that was clicked is no longer the one on the page. */
    var id = state.open ? state.open.id : null;
    var card = id != null ? document.querySelector('.ccard[data-id="' + id + '"]') : null;
    (card || state.opener || {}).focus && (card || state.opener).focus();
    state.open = null;
    state.opener = null;
  });

  el('refresh').addEventListener('click', refresh);
  el('logout').addEventListener('click', async function () {
    await fetch('/api/auth/logout', { method: 'POST' });
    location.replace('/staff');
  });

  refresh();
})(window);
