/* A surveyor's day, for the phone in the van: each survey in time order with
   the address (tap to navigate), the customer and the agent to call, access
   notes, whether the deposit is in, and photos straight onto the job. */
(function (global) {
  'use strict';

  var U = global.DSUI;
  var S = global.DSSV;
  var el = function (id) { return document.getElementById(id); };
  var KEY = 'ds_day_surveyor';
  var worker = function () { return Boolean(global.DSAREA && global.DSAREA.rights && global.DSAREA.rights.worker); };
  var FULL = 1600;
  var THUMB = 400;

  try { el('day-surveyor').value = global.localStorage.getItem(KEY) || ''; } catch (e) { /* private window */ }
  el('day-date').value = S.londonToday();

  async function shrink(file, max, quality) {
    var bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    var scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    var canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (bitmap.close) bitmap.close();
    var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/jpeg', quality); });
    return { blob: blob, width: canvas.width, height: canvas.height };
  }
  async function sendImage(url, blob) {
    var res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'image/jpeg', Accept: 'application/json' }, body: blob });
    var data = await res.json().catch(function () { return null; });
    if (!res.ok || !data || !data.ok) throw new Error((data && data.message) || 'The photo could not be uploaded.');
    return data.photo;
  }

  /* The photo route (lib/routes/admin/photos.js) takes damp surveys as well
     as quoted jobs; the photos stay private to staff. */
  function photos(s) {
    var wrap = U.node('div', 'day-photos');
    var label = U.node('label', 'pill act');
    var pick = document.createElement('input');
    pick.type = 'file'; pick.accept = 'image/*'; pick.multiple = true; pick.className = 'sr-only';
    label.appendChild(document.createTextNode('Add photos'));
    label.appendChild(pick);
    var status = U.node('span', 'card-meta');
    pick.addEventListener('change', async function () {
      var files = Array.prototype.slice.call(pick.files);
      for (var i = 0; i < files.length; i++) {
        status.textContent = 'Uploading ' + (i + 1) + ' of ' + files.length + '…';
        try {
          var full = await shrink(files[i], FULL, 0.82);
          var thumb = await shrink(files[i], THUMB, 0.76);
          var p = await sendImage('/api/admin/photos?job=' + s.id + '&stage=before&w=' + full.width + '&h=' + full.height, full.blob);
          await sendImage('/api/admin/photos?photo=' + p.id + '&size=thumb', thumb.blob);
        } catch (e) { status.textContent = e.message; pick.value = ''; return; }
      }
      status.textContent = files.length + ' photo' + (files.length === 1 ? '' : 's') + ' added.';
      pick.value = '';
    });
    wrap.appendChild(label);
    wrap.appendChild(status);
    return wrap;
  }

  function item(s, n) {
    var li = U.node('li', 'day-item ev--' + s.site);
    var head = U.node('div', 'card-top');
    head.appendChild(U.node('span', 'day-time', s.time || 'Time TBC'));
    head.appendChild(U.node('span', 'act-biz', S.BRAND[s.site] + ' · ' + n));
    li.appendChild(head);
    li.appendChild(U.node('p', 'card-name', s.name || 'No name'));
    li.appendChild(U.node('p', 'day-address', s.address || s.postcode || 'No address yet'));
    li.appendChild(U.node('p', 'card-meta', [s.surveyLabel, S.cap(s.surveyor)].filter(Boolean).join(' · ')));
    /* Surveyors never see who owes what (the server strips the sums too). */
    if (!worker()) li.appendChild(U.node('p', 'sv-badge' + (s.deposit || s.paid ? ' sv-badge--ok' : ' sv-badge--late'),
      s.paid ? 'Paid in full' : s.deposit ? (s.pricePence == null ? 'Deposit paid' : 'Deposit paid, ' + U.money(s.pricePence - s.depositPence) + ' to come') : 'No deposit yet'));
    if (s.awaitingAgent) li.appendChild(U.node('p', 'sv-badge sv-badge--agent', 'Time not yet confirmed by the agent'));
    var notes = [s.note, s.leadNotes].filter(Boolean).join('\n');
    if (notes) li.appendChild(U.node('p', 'day-notes', notes));
    var bar = U.node('div', 'card-actions');
    if (s.address || s.postcode) bar.appendChild(S.link('Navigate', S.maps(s.address || s.postcode), 'act-main'));
    if (s.phone) bar.appendChild(S.link('Call ' + (s.firstName || 'customer'), S.tel(s.phone)));
    if (s.agent && s.agent.phone) bar.appendChild(S.link('Call agent (' + s.agent.name + ')', S.tel(s.agent.phone)));
    if (!worker()) bar.appendChild(S.link('Open on board', '/staff/surveys.html?area=damp#job-' + s.id));
    li.appendChild(bar);
    li.appendChild(photos(s));
    return li;
  }

  async function load() {
    var who = el('day-surveyor').value;
    var date = el('day-date').value || S.londonToday();
    try { global.localStorage.setItem(KEY, who); } catch (e) { /* not kept, fine */ }
    var list = el('day-list');
    el('state').hidden = false;
    el('state').textContent = 'Loading…';
    try {
      var data = await U.get('/api/admin/surveys?view=day&date=' + date + (who ? '&surveyor=' + who : ''));
      list.textContent = '';
      data.surveys.forEach(function (s, i) {
        if (s.driveMin != null) list.appendChild(U.node('li', 'day-drive', (s.fromHome ? 'From home, ' : '') + s.driveMin + ' min drive'));
        list.appendChild(item(s, i + 1));
      });
      if (data.homeBy) list.appendChild(U.node('li', 'day-drive', 'Home about ' + data.homeBy));
      el('state').textContent = data.surveys.length ? '' : 'No surveys ' + (who ? 'for ' + S.cap(who) + ' ' : '') + 'on ' + S.shortDate(date) + '.';
      el('state').hidden = Boolean(data.surveys.length);
    } catch (e) { el('state').textContent = 'Could not load the day. ' + e.message; }
  }

  el('day-surveyor').addEventListener('change', load);
  el('day-date').addEventListener('change', load);
  el('day-prev').addEventListener('click', function () { el('day-date').value = S.addDays(el('day-date').value || S.londonToday(), -1); load(); });
  el('day-next').addEventListener('click', function () { el('day-date').value = S.addDays(el('day-date').value || S.londonToday(), 1); load(); });
  el('day-today').addEventListener('click', function () { el('day-date').value = S.londonToday(); load(); });
  var refresh = el('refresh');
  if (refresh) refresh.addEventListener('click', load);
  load();
})(window);
