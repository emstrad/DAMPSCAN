/* The shell every staff page shares, drawn after the page itself loads:

   - one page-view count per load (usage.js on the server: who, which page,
     which company, when; never an address or a device),
   - the search box in the header: a name, postcode, phone or email across
     every company this person holds, each hit opening that business's own
     screen (the damp client card, the quoted job, the enquiries list),
   - the + button: a new enquiry or job for a chosen company, a new to-do,
     or a cost on a job, each through the form that already does it,
   - on a phone, a bar along the bottom: Today, Search, +, Companies, Money.

   Loaded by area.js, so it needs no tag of its own on any page. */
(function (global) {
  'use strict';

  var U = global.DSUI;
  var A = global.DSAREA;
  if (!U || !A) return;
  var header = document.querySelector('header.top');
  var AREA_OF = { dampscan: 'damp', 'ati-london': 'damp', roofing: 'roofing', ac: 'ac' };
  var SHORT = { dampscan: 'DampScan', 'ati-london': 'ATi', roofing: 'Verge', ac: 'CoolRight' };

  /* ---------- the page-view count ---------- */
  (function beacon() {
    var body = JSON.stringify({ page: A.page, area: A.area });
    try {
      if (global.navigator.sendBeacon && global.navigator.sendBeacon('/api/admin/usage', body)) return;
    } catch (e) { /* fall through to fetch */ }
    fetch('/api/admin/usage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {});
  })();

  function go(url) {
    var here = global.location.pathname + global.location.search;
    var to = new URL(url, global.location.href);
    global.location.assign(to.href);
    /* Only the hash changed, so the page would not load again and would not
       open the job the hash names. */
    if (to.pathname + to.search === here) global.location.reload();
  }

  function jobLink(j, cost) {
    var area = AREA_OF[j.site];
    if (area === 'damp' && !cost) return '/staff/surveys.html?area=damp#job-' + j.id;
    return '/staff/quoted.html?area=' + area + '#job-' + j.id + (cost ? '-cost' : '');
  }

  /* ---------- search ---------- */
  var form = U.node('form', 'gsearch');
  form.setAttribute('role', 'search');
  var input = document.createElement('input');
  input.type = 'search';
  input.placeholder = 'Search name, postcode, phone';
  input.setAttribute('aria-label', 'Search customers');
  input.autocomplete = 'off';
  var results = U.node('div', 'gsearch-results');
  results.hidden = true;
  results.setAttribute('aria-live', 'polite');
  form.appendChild(input);
  form.appendChild(results);
  var mode = { cost: false };

  function hit(c) {
    var box = U.node('div', 'gs-hit');
    box.appendChild(U.node('p', 'gs-who', [c.name || 'No name', c.postcode].filter(Boolean).join(', ')));
    var sub = [c.phone, c.email].filter(Boolean).join(' · ');
    if (sub) box.appendChild(U.node('p', 'gs-sub', sub));
    var links = U.node('div', 'gs-links');
    c.jobs.filter(function (j) { return !mode.cost || AREA_OF[j.site] !== 'damp'; }).forEach(function (j) {
      var a = U.node('a', 'pill', SHORT[j.site] + ': ' + j.status + (j.date ? ', ' + j.date : ''));
      a.href = jobLink(j, mode.cost);
      links.appendChild(a);
    });
    if (!mode.cost) c.enquiries.forEach(function (e) {
      var a = U.node('a', 'pill', SHORT[e.site] + (e.closed ? ': closed enquiry' : ': enquiry'));
      a.href = '/staff/dashboard.html?area=' + AREA_OF[e.site];
      links.appendChild(a);
    });
    if (!links.children.length) return null;
    box.appendChild(links);
    return box;
  }

  var timer = 0;
  var asked = 0;
  async function search() {
    var q = input.value.trim();
    results.textContent = '';
    if (mode.cost) results.appendChild(U.node('p', 'gs-note', 'Find the job to add a cost to.'));
    if (q.length < 2) { results.hidden = !mode.cost; return; }
    var mine = ++asked;
    var data;
    try { data = await U.get('/api/admin/search?q=' + encodeURIComponent(q)); } catch (e) { data = { clients: [] }; }
    if (mine !== asked) return;
    var shown = 0;
    (data.clients || []).forEach(function (c) { var n = hit(c); if (n) { results.appendChild(n); shown += 1; } });
    if (!shown) results.appendChild(U.node('p', 'gs-note', 'Nobody found for "' + q + '".'));
    results.hidden = false;
  }
  input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(search, 200); });
  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var a = results.querySelector('a');
    if (a) go(a.href);
  });
  results.addEventListener('click', function (ev) {
    var a = ev.target.closest('a');
    if (a) { ev.preventDefault(); go(a.href); }
  });
  function openSearch(forCost) {
    mode.cost = Boolean(forCost);
    document.documentElement.classList.add('has-search');
    input.placeholder = forCost ? 'Which job? Name or postcode' : 'Search name, postcode, phone';
    input.focus();
    search();
  }
  function closeSearch() {
    document.documentElement.classList.remove('has-search');
    results.hidden = true;
    mode.cost = false;
  }
  document.addEventListener('click', function (ev) { if (!form.contains(ev.target) && !ev.target.closest('[data-shell="search"],[data-plus]')) closeSearch(); });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') { closeSearch(); closeSheet(); } });

  /* ---------- the + menu and the companies sheet ---------- */
  var sheet = U.node('div', 'shell-sheet');
  sheet.hidden = true;
  sheet.setAttribute('role', 'menu');
  document.body.appendChild(sheet);
  /* The bar's + turns to a cross while its menu is open (shell.css). */
  function plusOpen(on) { var p = document.querySelector('.bb-plus'); if (p) p.setAttribute('aria-expanded', on ? 'true' : 'false'); }
  function closeSheet() { sheet.hidden = true; plusOpen(false); }
  function item(text, onClick) {
    var b = U.node('button', 'shell-item', text);
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    b.addEventListener('click', function () { closeSheet(); onClick(); });
    sheet.appendChild(b);
  }
  function newWork(a) { return a === 'damp' ? '/staff/surveys.html?area=damp#new' : '/staff/quoted.html?area=' + a + '#new'; }
  function showSheet(anchor, fill) {
    if (!sheet.hidden && sheet.dataset.for === anchor.dataset.shell) { closeSheet(); return; }
    sheet.textContent = '';
    sheet.dataset.for = anchor.dataset.shell;
    fill();
    sheet.hidden = false;
    plusOpen(anchor.dataset.shell === 'plus-bar');
    var r = anchor.getBoundingClientRect();
    var phone = global.matchMedia('(max-width: 759px)').matches;
    sheet.classList.toggle('is-bottom', phone);
    if (!phone) { sheet.style.top = (r.bottom + global.scrollY + 6) + 'px'; sheet.style.left = Math.max(8, Math.min(r.left, global.innerWidth - 270)) + 'px'; }
    else { sheet.style.top = ''; sheet.style.left = ''; }
    var firstItem = sheet.querySelector('button, a');
    if (firstItem) firstItem.focus();
  }
  /* The To-do drawer (today-todo.js) on whatever page this is, loaded the
     first time it is wanted; it needs the one-tap helpers of calendar-actions.js. */
  function load(src) {
    return new Promise(function (ok, bad) {
      var tag = document.createElement('script');
      tag.src = src; tag.onload = ok; tag.onerror = bad;
      document.body.appendChild(tag);
    });
  }
  function openTodo(add) {
    if (global.DSTODO) { global.DSTODO.open(add); return; }
    (global.DSWORK ? Promise.resolve() : load('/staff/calendar-actions.js')).then(function () { return load('/staff/today-todo.js'); })
      .then(function () { global.DSTODO.open(add); }).catch(function () { go('/staff/todo.html'); });
  }
  if (/^#todo/.test(global.location.hash) && !document.querySelector('script[src="/staff/today-todo.js"]')) openTodo(global.location.hash === '#todo-add');
  function plusMenu() {
    (A.held || []).forEach(function (a) { item('New enquiry or job: ' + A.names[a], function () { go(newWork(a)); }); });
    item('New to-do', function () { openTodo(true); });
    item('To-do list', function () { openTodo(false); });
    item('Add a cost to a job', function () { openSearch(true); });
    /* What used to crowd the header: alerts on this phone, a fresh look, sign out. */
    sheet.appendChild(U.node('hr', 'shell-sep'));
    var P = global.DSPUSH;
    if (P && P.available) item(P.on ? 'Notifications on: tap to stop' : 'Turn on notifications', function () {
      P.toggle().then(function (r) { global.alert(r === 'on' ? 'Notifications are on for this device.' : r === 'off' ? 'Notifications are off for this device.' : 'Notifications are blocked in this phone\'s settings.'); document.dispatchEvent(new CustomEvent('ds:push')); },
        function () { global.alert('That did not work. Try again.'); });
    });
    item('Refresh', function () { global.location.reload(); });
    item('Sign out', function () { fetch('/api/auth/logout', { method: 'POST' }).finally(function () { global.location.replace('/staff'); }); });
  }
  function companiesMenu() {
    (A.held || []).forEach(function (a) {
      var link = U.node('a', 'shell-item', A.names[a]);
      link.href = '/staff/' + A.first(a) + '?area=' + a;
      link.setAttribute('role', 'menuitem');
      sheet.appendChild(link);
    });
    /* Settings lives here on a phone: the cog at the end of the company row runs off the screen. */
    if (A.rights && A.rights.settings) {
      var cog = U.node('a', 'shell-item', 'Settings');
      cog.href = '/staff/settings.html';
      cog.setAttribute('role', 'menuitem');
      sheet.appendChild(cog);
    }
  }
  document.addEventListener('click', function (ev) {
    if (sheet.hidden || sheet.contains(ev.target) || ev.target.closest('[data-shell]')) return;
    closeSheet();
  });

  function button(text, key, cls, label) {
    var b = U.node('button', cls, text);
    b.type = 'button';
    b.dataset.shell = key;
    if (label) b.setAttribute('aria-label', label);
    return b;
  }

  if (header) {
    var plus = button('+', 'plus', 'btn btn--primary btn--sm shell-plus', 'Add new');
    plus.setAttribute('data-plus', '');
    plus.addEventListener('click', function () { showSheet(plus, plusMenu); });
    var end = header.querySelector('.top-end');
    header.insertBefore(form, end || null);
    header.insertBefore(plus, end || null);
    if (!document.getElementById('todo-open')) {
      var todo = button('To-do', 'todo', 'btn btn--ghost btn--sm shell-todo');
      todo.addEventListener('click', function () { openTodo(false); });
      header.insertBefore(todo, end || null);
    }
  }

  /* ---------- the phone's bottom bar ---------- */
  var bar = U.node('nav', 'bottom-bar');
  bar.setAttribute('aria-label', 'Main');
  function barLink(text, href, current) {
    var a = U.node('a', 'bb-item', text);
    a.href = href;
    if (current) a.setAttribute('aria-current', 'page');
    bar.appendChild(a);
  }
  var todayPages = ['calendar.html', 'due.html', 'todo.html'];
  barLink('Today', '/staff/calendar.html', todayPages.indexOf(A.page) !== -1);
  /* The owners' bar: Scheduling where Search was, Search where Money was. */
  barLink('Scheduling', '/staff/schedule.html?area=damp', A.page === 'schedule.html');
  var sched = bar.lastChild;
  var bPlus = button('', 'plus-bar', 'bb-item bb-plus', 'Add new');
  bPlus.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';
  bPlus.setAttribute('aria-expanded', 'false');
  bPlus.setAttribute('data-plus', '');
  bPlus.addEventListener('click', function () { showSheet(bPlus, plusMenu); });
  bar.appendChild(bPlus);
  var cBtn = button('Companies', 'companies', 'bb-item' + (A.area && todayPages.indexOf(A.page) === -1 && A.page !== 'bank.html' && A.page !== 'schedule.html' ? ' is-current' : ''));
  cBtn.addEventListener('click', function () { showSheet(cBtn, companiesMenu); });
  bar.appendChild(cBtn);
  var sBtn = button('Search', 'search', 'bb-item');
  sBtn.addEventListener('click', function () { openSearch(false); });
  bar.appendChild(sBtn);
  /* Scheduling is for managers (the server says so too): hidden from the rest. */
  function schedFor() { var r = A.rights; if (r && r.known && !Object.keys(r.manages || {}).some(function (k) { return r.manages[k]; })) sched.hidden = true; }
  schedFor();
  document.addEventListener('ds:me', schedFor);
  document.body.appendChild(bar);
  document.documentElement.classList.add('has-shell');

  /* While any dialog or the To-do drawer is open the page behind it stays
     still, so a swipe inside a pop-up on a phone scrolls the pop-up and never
     the page underneath. One watcher for every page's dialogs. */
  function lockCheck() {
    var open = document.querySelector('dialog[open]') || document.querySelector('.todo-drawer:not([hidden])');
    document.documentElement.classList.toggle('is-locked', Boolean(open));
  }
  new MutationObserver(lockCheck).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open', 'hidden'], childList: true });
  lockCheck();

  /* The + menu's "new" lands on the page's own add form, scrolled to and
     ready. Pages keep their content hidden until their data arrives, so this
     waits (up to a few seconds) for the form to be on screen. */
  if (global.location.hash === '#new') {
    var h = document.getElementById('h-add') || document.getElementById('h-new');
    if (h) {
      global.history.replaceState(null, '', global.location.pathname + global.location.search);
      var tries = 0;
      (function land() {
        var section = h.closest('section') || h;
        if (!section.offsetParent && tries++ < 40) { setTimeout(land, 150); return; }
        section.scrollIntoView({ block: 'start' });
        var field = [].slice.call(section.querySelectorAll('input:not([type=hidden]), select, textarea')).filter(function (f) { return f.offsetParent; })[0];
        if (field) field.focus({ preventScroll: true });
      })();
    }
  }
})(window);
