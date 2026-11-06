/* The surveyors' staff area (work level, such as Ronnie and Ben): only what
   they need to do their own surveys. Today (their own jobs), My hours, the +
   menu (notifications, Refresh, Sign out) and Search. No company pages, no
   Scheduling, no money; the server keeps their lists to their own jobs too
   (lib/worker-view.js). Loaded after shell.js by area.js. */
(function (global) {
  'use strict';
  var A = global.DSAREA;
  /* The pages a surveyor uses; anything else sends them to Today. */
  var PAGES = ['calendar.html', 'hours.html', 'day.html', 'todo.html'];

  function isWorker() {
    var r = A && A.rights;
    return Boolean(r && r.known && !r.money && !Object.keys(r.manages || {}).some(function (k) { return r.manages[k]; }));
  }

  function apply() {
    /* Scheduling is for the damp managers (the server says so too). */
    var m = (A.rights && A.rights.manages) || {};
    if (A.rights && A.rights.known && !m.dampscan && !m['ati-london']) document.querySelectorAll('.bottom-bar a[href*="schedule.html"]').forEach(function (n) { n.hidden = true; });
    if (!isWorker()) return;
    A.rights.worker = true;
    document.documentElement.classList.add('is-worker');
    if (PAGES.indexOf(A.page) === -1) { global.location.replace('/staff/calendar.html'); return; }
    /* The Due page is the company's list: the pointer to it goes, words and all. */
    document.querySelectorAll('a[href="/staff/due.html"]').forEach(function (a) { var t = a.nextSibling; if (t && t.nodeType === 3) t.remove(); a.remove(); });
    var bar = document.querySelector('.bottom-bar');
    if (!bar || bar.dataset.worker) return;
    bar.dataset.worker = '1';
    bar.classList.add('bb-worker');
    bar.querySelectorAll('a[href*="schedule.html"], [data-shell="companies"]').forEach(function (n) { n.remove(); });
    var hours = document.createElement('a');
    hours.className = 'bb-item';
    hours.textContent = 'My hours';
    hours.href = '/staff/hours.html?area=damp';
    if (A.page === 'hours.html') hours.setAttribute('aria-current', 'page');
    bar.insertBefore(hours, bar.querySelector('.bb-plus'));
    /* Route, after the +: their day in order with the drives (day.html). */
    var route = document.createElement('a'); route.className = 'bb-item'; route.textContent = 'Route'; route.href = '/staff/day.html?area=damp';
    if (A.page === 'day.html') route.setAttribute('aria-current', 'page');
    bar.insertBefore(route, bar.querySelector('.bb-plus').nextSibling);
    if (A.page === 'day.html') {
      var h = document.querySelector('h1'); if (h) h.textContent = 'My route';
      document.title = 'My route';
    }
  }

  if (A && A.rights && A.rights.known) apply();
  document.addEventListener('ds:me', apply);
})(window);
