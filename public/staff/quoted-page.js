/* The job's own page on the website, inside the Photos block: a title, the
   town and a write-up, and a tick to publish it as a project page at
   /our-work/<slug>. Once it is live, "Copy Google post" puts ready-written
   text on the clipboard to paste into the Google Business Profile.

   The server decides whether it may go up (lib/job-pages.js) and says why
   not, so the rules live in one place. Loaded after quoted-photos.js, which
   hands it the page with every load of the photos. */
(function (global) {
  'use strict';

  var U = global.DSUI;
  var Q = global.DSQ;
  var block = document.querySelector('#job-dialog .photo-block');
  if (!block) return;

  var box = U.node('div', 'job-page');
  box.id = 'h-page';
  box.appendChild(U.node('h4', null, 'Project page on the website'));

  function input(id, label, placeholder) {
    var row = U.node('label', 'photo-field');
    row.appendChild(U.node('span', null, label));
    var el = document.createElement(id === 'jp-writeup' ? 'textarea' : 'input');
    el.id = id;
    if (el.tagName === 'INPUT') el.type = 'text';
    else el.rows = 6;
    el.placeholder = placeholder;
    row.appendChild(el);
    box.appendChild(row);
    return el;
  }
  var title = input('jp-title', 'Title', 'Re-roof');
  var town = input('jp-town', 'Town', 'Orpington');
  var writeup = input('jp-writeup', 'Write-up', 'What was wrong, what we did and how it turned out. At least 60 words.');
  var count = U.node('span', 'who');
  box.appendChild(count);
  var tick = U.node('label', 'photo-tick');
  var publish = document.createElement('input');
  publish.type = 'checkbox';
  tick.appendChild(publish);
  tick.appendChild(document.createTextNode(' Publish as project page'));
  box.appendChild(tick);
  var actions = U.node('div', 'card-actions');
  var save = U.node('button', 'pill', 'Save page');
  save.type = 'button';
  var copy = U.node('button', 'pill', 'Copy Google post');
  copy.type = 'button';
  copy.hidden = true;
  var link = document.createElement('a');
  link.target = '_blank';
  link.rel = 'noopener';
  link.hidden = true;
  link.textContent = 'View page';
  [save, copy, link].forEach(function (n) { actions.appendChild(n); });
  box.appendChild(actions);
  var note = U.node('p', 'panel-note');
  note.setAttribute('role', 'status');
  box.appendChild(note);
  block.appendChild(box);

  var post = null;

  function words() {
    var n = writeup.value.split(/\s+/).filter(Boolean).length;
    count.textContent = n + ' words';
  }
  writeup.addEventListener('input', words);

  function draw(page) {
    if (!page) return;
    title.value = page.title;
    town.value = page.town;
    writeup.value = page.writeup;
    publish.checked = page.publish;
    words();
    post = page.googlePost;
    copy.hidden = !post;
    link.hidden = !page.url;
    if (page.url) link.href = page.url;
    if (page.live) note.textContent = 'Live on the website' + (page.district ? ', shown as ' + page.town + ', ' + page.district : '') + '.';
    else if (page.publish) note.textContent = 'Not live yet: ' + page.problems.join(' ');
    else note.textContent = page.problems.length ? 'Before it can go up: ' + page.problems.join(' ') : 'Ready to publish.';
  }

  save.addEventListener('click', async function () {
    save.disabled = true;
    var res = await U.send('/api/admin/photos', { op: 'page', job: Q.state.open.id, title: title.value, town: town.value, writeup: writeup.value, publish: publish.checked });
    save.disabled = false;
    if (!res.data) { note.textContent = 'That could not be saved.'; return; }
    draw(res.data.page);
    if (!res.ok) {
      var e = res.data.errors || {};
      note.textContent = 'Saved, but not published: ' + Object.keys(e).map(function (k) { return e[k]; }).join(' ');
      publish.checked = false;
    }
  });

  copy.addEventListener('click', async function () {
    if (!post) return;
    try {
      await navigator.clipboard.writeText(post);
      note.textContent = 'Copied. Paste it into a new update on the Google Business Profile.';
    } catch (e) {
      global.prompt('Copy this into a Google Business Profile update:', post);
    }
  });

  global.DSQPAGE = { draw: draw };
})(window);
