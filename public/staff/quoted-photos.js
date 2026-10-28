/* Photos on the job screen: taken on site, shrunk on the phone before they
   upload, and kept private unless somebody ticks one for the website.

   Shrinking here is what makes this work from a phone on a roof. A camera
   photo is 3 to 8MB; redrawn at 2000px it is a few hundred KB, which goes up
   on a weak signal and fits a function's request limit. Redrawing also drops
   the photo's metadata, GPS included, and the server strips it again. */
(function (global) {
  'use strict';

  var U = global.DSUI;
  var Q = global.DSQ;
  var FULL = 2000;
  var THUMB = 640;
  var STAGES = [['before', 'Before'], ['during', 'During'], ['after', 'After']];
  var current = null;

  var block = U.node('section', 'client-block photo-block');
  block.setAttribute('aria-labelledby', 'h-photos');
  var h = U.node('h3', null, 'Photos');
  h.id = 'h-photos';
  block.appendChild(h);
  var bar = U.node('div', 'work-add');
  var stageSel = document.createElement('select');
  stageSel.id = 'ph-stage';
  STAGES.forEach(function (s) { var o = document.createElement('option'); o.value = s[0]; o.textContent = s[1]; stageSel.appendChild(o); });
  stageSel.value = 'during';
  var stageRow = U.node('div', 'form-row');
  var stageLabel = U.node('label', null, 'These photos are');
  stageLabel.htmlFor = 'ph-stage';
  stageRow.appendChild(stageLabel);
  stageRow.appendChild(stageSel);
  var pick = document.createElement('input');
  pick.type = 'file';
  pick.accept = 'image/*';
  pick.multiple = true;
  pick.id = 'ph-file';
  pick.className = 'sr-only';
  var pickLabel = U.node('label', 'btn btn--primary btn--sm', 'Add photos');
  pickLabel.htmlFor = 'ph-file';
  var status = U.node('span', 'who');
  status.setAttribute('role', 'status');
  [stageRow, pick, pickLabel, status].forEach(function (n) { bar.appendChild(n); });
  block.appendChild(bar);
  var grid = U.node('div', 'photo-grid');
  block.appendChild(grid);
  var err = U.node('span', 'err');
  err.setAttribute('role', 'alert');
  block.appendChild(err);
  var after = document.querySelector('#job-dialog .msg-block') || document.querySelector('#job-dialog .quote-block');
  after.parentNode.insertBefore(block, after.nextSibling);

  function fail(m) { err.textContent = m; err.classList.add('is-shown'); }

  /* A JPEG of the image at most `max` pixels on its longer side. */
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

  async function upload(files) {
    err.classList.remove('is-shown');
    var job = Q.state.open;
    for (var i = 0; i < files.length; i++) {
      status.textContent = 'Uploading ' + (i + 1) + ' of ' + files.length + '…';
      try {
        var full = await shrink(files[i], FULL, 0.82);
        var thumb = await shrink(files[i], THUMB, 0.76);
        var photo = await sendImage('/api/admin/photos?job=' + job.id + '&stage=' + stageSel.value + '&w=' + full.width + '&h=' + full.height, full.blob);
        await sendImage('/api/admin/photos?photo=' + photo.id + '&size=thumb', thumb.blob);
      } catch (e) {
        fail(e.message === 'The source image cannot be decoded.' ? 'That file is not a photo this browser can read.' : e.message);
        break;
      }
    }
    status.textContent = '';
    pick.value = '';
    load(job.id);
  }

  function field(labelText, control) {
    var row = U.node('label', 'photo-field');
    row.appendChild(U.node('span', null, labelText));
    row.appendChild(control);
    return row;
  }

  function card(p) {
    var c = U.node('div', 'photo-card' + (p.public ? ' is-public' : ''));
    var a = document.createElement('a');
    a.href = '/api/admin/photos?img=' + p.id + '&size=full';
    a.target = '_blank';
    a.rel = 'noopener';
    var img = document.createElement('img');
    img.src = '/api/admin/photos?img=' + p.id + '&size=thumb';
    img.alt = (p.caption || 'Job photo') + ', ' + p.stage;
    img.loading = 'lazy';
    a.appendChild(img);
    c.appendChild(a);
    var stage = document.createElement('select');
    STAGES.forEach(function (s) { var o = document.createElement('option'); o.value = s[0]; o.textContent = s[1]; stage.appendChild(o); });
    stage.value = p.stage;
    var note = document.createElement('input'); note.type = 'text'; note.value = p.caption || ''; note.placeholder = 'Note for the team';
    var pub = document.createElement('input'); pub.type = 'checkbox'; pub.checked = p.public;
    var cap = document.createElement('input'); cap.type = 'text'; cap.value = p.publicCaption || ''; cap.placeholder = 'New natural slate roof';
    var area = document.createElement('input'); area.type = 'text'; area.value = p.area || ''; area.placeholder = 'Petts Wood';
    var pubBox = U.node('div', 'photo-public');
    pubBox.appendChild(field('Caption on the website', cap));
    pubBox.appendChild(field('Town', area));
    pubBox.hidden = !p.public;
    pub.addEventListener('change', function () { pubBox.hidden = !pub.checked; });
    var tick = U.node('label', 'photo-tick');
    tick.appendChild(pub);
    tick.appendChild(document.createTextNode(' Show on the website'));
    [field('Stage', stage), field('Note', note), tick, pubBox].forEach(function (n) { c.appendChild(n); });
    var actions = U.node('div', 'card-actions');
    var save = U.node('button', 'pill', 'Save');
    save.type = 'button';
    save.addEventListener('click', function () {
      change({ op: 'update', id: p.id, stage: stage.value, caption: note.value, public: pub.checked, publicCaption: cap.value, area: area.value }, save);
    });
    var del = U.node('button', 'pill', 'Delete');
    del.type = 'button';
    del.addEventListener('click', function () { if (global.confirm('Delete this photo for good?')) change({ op: 'delete', id: p.id }, del); });
    actions.appendChild(save);
    actions.appendChild(del);
    c.appendChild(actions);
    return c;
  }

  function draw(photos) {
    grid.textContent = '';
    if (!photos.length) { grid.appendChild(U.node('p', 'panel-note', 'No photos yet.')); return; }
    photos.forEach(function (p) { grid.appendChild(card(p)); });
  }

  async function change(body, button) {
    err.classList.remove('is-shown');
    button.disabled = true;
    var res = await U.send('/api/admin/photos', body);
    button.disabled = false;
    if (!res.ok) { var e = (res.data && res.data.errors) || {}; fail(e[Object.keys(e)[0]] || 'That could not be saved.'); return; }
    draw(res.data.photos);
    if (global.DSQPAGE) global.DSQPAGE.draw(res.data.page);
    if (body.op === 'update') { status.textContent = 'Saved'; setTimeout(function () { status.textContent = ''; }, 2000); }
  }

  async function load(jobId) {
    try {
      var data = await U.get('/api/admin/photos?job=' + jobId);
      draw(data.photos || []);
      if (global.DSQPAGE) global.DSQPAGE.draw(data.page);
    } catch (e) { fail('The photos could not be loaded.'); }
  }

  pick.addEventListener('change', function () { if (pick.files.length) upload(Array.prototype.slice.call(pick.files)); });

  /* Called on every redraw of the job; the photos only reload when a
     different job is opened, not after each quote line. */
  function fill(j) {
    if (current === j.id) return;
    current = j.id;
    err.classList.remove('is-shown');
    grid.textContent = '';
    load(j.id);
  }
  document.getElementById('job-dialog').addEventListener('close', function () { current = null; });

  global.DSQPHOTOS = { fill: fill };
})(window);
