/* The sections of the job sheet (calendar-pop.js) that a surveyor uses on the
   doorstep: where the job is and how to get there, who to ring, and the
   pictures. Kept apart from the sheet itself so each file stays readable.
   Navigation links open the app on the phone; Waze is first because it is
   what the surveyors drive with. */
(function (global) {
  'use strict';

  var U = global.DSUI;
  var FULL = 1600;
  var THUMB = 400;

  function big(text, href, cls) {
    var a = U.node('a', 'sheet-big ' + (cls || ''), text);
    a.href = href;
    if (/^https:/.test(href)) { a.target = '_blank'; a.rel = 'noopener'; }
    return a;
  }

  /* Only for the people who asked for it, so nobody else gets an extra button. */
  var CAR_DRIVERS = ['ronnie'];
  function sendsToCar() {
    var me = (global.DSAREA || {}).me || {};
    return CAR_DRIVERS.indexOf(String(me.name || '').trim().split(/\s+/)[0].toLowerCase()) !== -1;
  }

  /* Where: the address in full, three ways to drive there, and the customer's
     phone and email. A job booked by phone or the assistant carries its own
     address; an enquiry's comes from the form (lib/calendar-job.js). */
  function where(j, s) {
    var addr = (j.address || []).join(', ');
    s.appendChild(U.node('p', 'sheet-addr', addr || 'No address on file' + (j.postcode ? ', postcode ' + j.postcode : '') + '.'));
    var q = encodeURIComponent(addr || j.postcode || '');
    if (q) {
      var nav = U.node('div', 'sheet-grid');
      nav.appendChild(big('Waze', 'https://waze.com/ul?q=' + q + '&navigate=yes', 'is-main'));
      nav.appendChild(big('Google', 'https://www.google.com/maps/dir/?api=1&destination=' + q));
      nav.appendChild(big('Apple', 'https://maps.apple.com/?daddr=' + q));
      s.appendChild(nav);
      if (sendsToCar() && navigator.share) {
        /* Ronnie drives by his Tesla's own sat nav: the share sheet hands the
           address to the Tesla app, which sends it to the car. */
        var car = U.node('button', 'sheet-big is-main sheet-car', 'Send to car');
        car.type = 'button';
        car.addEventListener('click', function () {
          var pc = j.postcode && addr.indexOf(j.postcode) === -1 ? j.postcode : '';
          navigator.share({ text: [addr, pc].filter(Boolean).join(', ') }).catch(function () {});
        });
        s.appendChild(car);
      }
    }
    var tel = j.phone ? String(j.phone).replace(/[^\d+]/g, '') : '';
    var talk = U.node('div', 'sheet-grid');
    if (tel) {
      talk.appendChild(big('Call', 'tel:' + tel, 'is-main'));
      talk.appendChild(big('WhatsApp', 'https://wa.me/' + tel.replace(/^\+/, '').replace(/^0/, '44')));
      talk.appendChild(big('Text', 'sms:' + tel));
    }
    if (j.email) talk.appendChild(big('Email', 'mailto:' + j.email));
    if (talk.children.length) {
      s.appendChild(talk);
      /* The number and email written out small, to read over the phone or copy. */
      s.appendChild(U.node('p', 'meta', [j.phone, j.email].filter(Boolean).join(' · ')));
    }
    else s.appendChild(U.node('p', 'panel-note', 'No phone or email on file.'));
  }

  /* Label and value pairs, skipping the empty ones. */
  function facts(s, pairs) {
    var dl = U.node('dl', 'sheet-facts');
    pairs.forEach(function (p) {
      if (p[1] == null || p[1] === '') return;
      dl.appendChild(U.node('dt', null, p[0]));
      var dd = U.node('dd', null, '');
      if (p[1].nodeType) dd.appendChild(p[1]); else dd.textContent = String(p[1]);
      dl.appendChild(dd);
    });
    if (dl.children.length) s.appendChild(dl);
  }

  function agentLine(a) {
    if (!a) return null;
    var span = U.node('span', null, a.name + (a.branch ? ', ' + a.branch : ''));
    if (a.phone) { span.appendChild(document.createTextNode(' ')); span.appendChild(big('Call agent', 'tel:' + String(a.phone).replace(/[^\d+]/g, ''), 'is-inline')); }
    if (a.email) { span.appendChild(document.createTextNode(' ')); span.appendChild(big('Email agent', 'mailto:' + a.email, 'is-inline')); }
    return span;
  }

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

  function thumb(src, full, label) {
    var a = U.node('a', 'sheet-thumb');
    a.href = full; a.target = '_blank'; a.rel = 'noopener';
    a.setAttribute('aria-label', label);
    var img = document.createElement('img');
    img.src = src; img.alt = label; img.loading = 'lazy';
    a.appendChild(img);
    return a;
  }

  /* Photos and files: what the customer sent with the enquiry (private blobs,
     read through the attachment route) and the job's own photos, each a
     thumbnail that opens full size. Shrunk on the phone before upload, as on
     the day sheet, so it goes up on a weak signal. */
  function pictures(j, s, changed) {
    var grid = U.node('div', 'sheet-thumbs');
    (j.files || []).forEach(function (f) {
      var href = '/api/admin/attachment?path=' + encodeURIComponent(f.path);
      if (f.image) grid.appendChild(thumb(href, href, 'Enquiry photo ' + f.name));
      else { var a = big(f.name, href, 'sheet-file'); grid.appendChild(a); }
    });
    (j.photos || []).forEach(function (p) {
      var full = '/api/admin/photos?img=' + p.id + '&size=full';
      grid.appendChild(thumb(p.thumb ? '/api/admin/photos?img=' + p.id + '&size=thumb' : full, full, p.caption || 'Job photo ' + p.id));
    });
    if (grid.children.length) s.appendChild(grid);
    var label = U.node('label', 'pill');
    var pick = document.createElement('input');
    pick.type = 'file'; pick.accept = 'image/*'; pick.multiple = true; pick.className = 'sr-only';
    label.appendChild(document.createTextNode('Add photos'));
    label.appendChild(pick);
    var status = U.node('p', 'panel-note');
    status.setAttribute('role', 'status');
    pick.addEventListener('change', async function () {
      var files = Array.prototype.slice.call(pick.files);
      for (var i = 0; i < files.length; i++) {
        status.textContent = 'Uploading ' + (i + 1) + ' of ' + files.length + '…';
        try {
          var full = await shrink(files[i], FULL, 0.82);
          var small = await shrink(files[i], THUMB, 0.76);
          var p = await sendImage('/api/admin/photos?job=' + j.id + '&stage=during&w=' + full.width + '&h=' + full.height, full.blob);
          await sendImage('/api/admin/photos?photo=' + p.id + '&size=thumb', small.blob);
        } catch (e) { status.textContent = e.message; pick.value = ''; return; }
      }
      pick.value = '';
      changed();
    });
    s.appendChild(label);
    s.appendChild(status);
  }

  /* The one next step for a damp survey, in a line at the top of the sheet,
     so the urgent thing is the first thing read. Nothing when all is done. */
  function next(j, into) {
    if (j.quoted || ['cancelled', 'declined'].indexOf(j.status) !== -1) return;
    var today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
    var done = j.dateSet && j.date && (j.status === 'completed' || j.date < today);
    var m = j.money;
    var say = !j.dateSet ? (j.awaitingAgent ? 'Waiting on the estate agent for a time.' : 'Not booked in: pick a day below.')
      : !j.time ? 'Time to confirm with the customer.'
      : done && !j.reportSent ? 'Report to send.'
      : done && m && !j.paid ? 'Balance to collect.'
      : !done && m && !j.depositPaid ? 'Deposit to collect (' + U.money(m.depositPence) + ').'
      : null;
    if (!say) return;
    var p = U.node('p', 'sheet-next', say);
    into.appendChild(p);
  }

  global.DSPOPX = { where: where, facts: facts, agentLine: agentLine, pictures: pictures, big: big, next: next };
})(window);
