/* Client cards: one per booked job, joined to the enquiry it came from.
   The grid is the list; a card opens a dialog with everything on it and the
   two payment boxes. Plain DOM, same as the rest of the staff area. */
(function (global) {
  'use strict';

  var U = global.DSUI;
  var el = function (id) { return document.getElementById(id); };

  var state = { site: '', status: 'booked', clients: [], open: null, opener: null };

  var SITE = { 'ati-london': 'London', dampscan: 'Kent' };

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

  function addressLines(c) {
    return [c.address.line1, c.address.line2, c.address.town, c.address.postcode].filter(Boolean);
  }

  function displayName(path) {
    return path.split('/').pop().replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '');
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
    b.appendChild(chips);

    b.addEventListener('click', function () { open(c, b); });
    return b;
  }

  function render() {
    var mount = el('cards');
    mount.textContent = '';
    if (!state.clients.length) {
      mount.appendChild(U.node('p', 'empty', state.status === 'booked'
        ? 'No surveys booked in. Save a job as booked on the Jobs page and it appears here.'
        : 'Nothing here yet.'));
    }
    state.clients.forEach(function (c) { mount.appendChild(card(c)); });

    var due = state.clients.filter(function (c) { return !c.money.paidAt; }).length;
    el('summary').textContent = state.clients.length
      ? U.num(state.clients.length) + (state.clients.length === 1 ? ' client' : ' clients')
        + (due ? ', ' + U.num(due) + ' with money still to come' : ', all paid')
      : '';
  }

  /* ---------- the dialog ---------- */
  function lines(mount, items) {
    mount.textContent = '';
    items.forEach(function (item, i) {
      if (i) mount.appendChild(document.createElement('br'));
      if (typeof item === 'string') mount.appendChild(document.createTextNode(item));
      else mount.appendChild(item);
    });
  }

  function link(href, text) {
    var a = document.createElement('a');
    a.href = href; a.textContent = text;
    return a;
  }

  function fillDialog(c) {
    el('c-name').textContent = c.name || 'No name';
    el('c-sub').textContent = c.survey.label + ' survey, ' + U.money(c.survey.pricePence)
      + (c.survey.remedialPence ? ' plus ' + U.money(c.survey.remedialPence) + ' remedial' : '')
      + ' · surveyed by ' + (c.survey.surveyor || 'unassigned').replace(/^./, function (m) { return m.toUpperCase(); })
      + ' · ' + (SITE[c.site] || c.site);

    var contact = [];
    if (c.phone) contact.push(link('tel:' + c.phone.replace(/\s+/g, ''), c.phone));
    if (c.email) contact.push(link('mailto:' + c.email, c.email));
    lines(el('c-contact'), contact.length ? contact : ['No contact details on the enquiry']);

    var addr = addressLines(c);
    lines(el('c-address'), addr.length ? addr : ['No address on file. Add one on the Jobs page or ask the client.']);
    var maps = el('c-maps');
    maps.hidden = !addr.length;
    if (addr.length) maps.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(addr.join(', '));

    var enquiry = [];
    if (c.issues.length) enquiry.push('Dealing with: ' + c.issues.join(', '));
    if (c.previousSurvey !== null && c.previousSurvey !== undefined) enquiry.push(c.previousSurvey ? 'Has had a survey before' : 'No previous survey');
    if (c.leadNotes) enquiry.push('They said: ' + c.leadNotes);
    if (!c.leadId) enquiry.push('Recorded by hand on the Jobs page, not from the website form.');
    lines(el('c-enquiry'), enquiry.length ? enquiry : ['Nothing beyond the booking itself.']);

    var files = el('c-files');
    files.textContent = '';
    if (!c.files.length) files.appendChild(U.node('li', 'empty', 'None attached'));
    c.files.forEach(function (path) {
      var li = document.createElement('li');
      var a = link('/api/admin/attachment?path=' + encodeURIComponent(path), displayName(path));
      a.className = 'pill';
      li.appendChild(a);
      files.appendChild(li);
    });

    el('c-deposit').checked = Boolean(c.money.depositPaidAt);
    el('c-deposit-amt').textContent = U.money(c.money.depositPence) + ', half the survey price';
    el('c-deposit-when').textContent = c.money.depositPaidAt ? 'on ' + U.when(c.money.depositPaidAt) : '';
    el('c-paid').checked = Boolean(c.money.paidAt);
    el('c-paid-amt').textContent = U.money(c.survey.pricePence) + ' in total';
    el('c-paid-when').textContent = c.money.paidAt ? 'on ' + U.when(c.money.paidAt) : '';

    el('c-date').value = c.surveyDate || '';
    el('c-note').value = c.note || '';
    el('c-edit').href = '/staff/jobs.html#job-' + c.id;
    el('client-error').classList.remove('is-shown');
    el('c-saved').textContent = '';
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
    state.clients = state.clients.map(function (x) { return x.id === fresh.id ? fresh : x; });
    state.open = fresh;
    fillDialog(fresh);
    render();
    el('c-saved').textContent = 'Saved';
  }

  /* ---------- loading and wiring ---------- */
  async function refresh() {
    var qs = '?status=' + state.status + (state.site ? '&site=' + state.site : '');
    try {
      var data = await U.get('/api/admin/clients' + qs);
      state.clients = data.clients || [];
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
  pills('[data-status]', 'status');

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
