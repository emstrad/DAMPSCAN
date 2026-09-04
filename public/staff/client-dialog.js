/* The big, simple view of one client: filling the dialog from a card.
   Split from clients.js, which holds the grid, the search and the save, when
   the search took that file past the 300 line limit the rest of the project
   keeps to. Everything here reads a card and writes the dialog; nothing here
   knows how the list was fetched or what happens on save. Loaded before
   clients.js, which takes what it needs from window.DSCLIENTDIALOG. */
(function (global) {
  'use strict';

  var U = global.DSUI;
  var el = function (id) { return document.getElementById(id); };

  var SITE = { 'ati-london': 'London', dampscan: 'Kent' };

  function addressLines(c) {
    return [c.address.line1, c.address.line2, c.address.town, c.address.postcode].filter(Boolean);
  }

  function displayName(path) {
    return path.split('/').pop().replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '');
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

  global.DSCLIENTDIALOG = { fill: fillDialog, addressLines: addressLines, SITE: SITE };
})(window);
