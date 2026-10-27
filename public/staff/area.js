/* The staff site's two levels of navigation.

   Across the top: Today (the calendar, with everything due and the to-do
   list), then the companies, ATi & DampScan, Verge Roofing and CoolRight,
   then Money (the bank, filtered by company) and the Settings cog.
   Underneath, once a company is chosen: its own sections (Leads, Pipeline
   and the rest), which differ because the businesses work differently.
   Every company page shows only the chosen company's data. On a phone the
   top row becomes a bar along the bottom (shell.js draws it).

   The company comes from ?area= in the address, then from the last one used
   on this device, then the first the signed in person holds. A person sees
   only the companies their grants cover; the shared owners' code and an
   admin see all three.

   Loaded straight after ui.js on every staff page and before the page's own
   script, so the navigation and the brand pills are right before anything
   loads, and DSUI.get adds the company to every request that takes one. */
(function (global) {
  'use strict';

  var AREAS = {
    damp: {
      name: 'ATi & DampScan', sites: ['dampscan', 'ati-london'], books: 'damp',
      tabs: [['Surveys', 'surveys.html'], ['Scheduling', 'schedule.html'], ['Reports', 'reports.html'], ['Day sheet', 'day.html'], ['Agents', 'agents.html'], ['Leads', 'dashboard.html'], ['Jobs', 'jobs.html'], ['Clients', 'clients.html'], ['Insights', 'insights.html'], ['Records', 'records.html'], ['My hours', 'hours.html'], ['Lab', 'lab.html']]
    },
    roofing: {
      name: 'Verge Roofing', sites: ['roofing'], books: 'roofing',
      tabs: [['Pipeline', 'roofing.html'], ['Week', 'week.html'], ['Leads', 'dashboard.html'], ['Quotes and jobs', 'quoted.html'], ['Insights', 'insights.html']]
    },
    ac: {
      name: 'CoolRight', sites: ['ac'], books: 'ac',
      tabs: [['Installs', 'coolright.html'], ['Services', 'service.html'], ['Leads', 'dashboard.html'], ['Quotes and jobs', 'quoted.html'], ['Insights', 'insights.html']]
    }
  };
  var ORDER = ['damp', 'roofing', 'ac'];
  var KEY = 'ds_staff_area';
  var CALENDAR = 'calendar.html';
  var TODO = 'todo.html';
  var MONEY = 'bank.html';
  var SETTINGS = 'settings.html';
  /* Pages every company has but which are not section tabs: Due and the
     to-do list now live in Today and keep working for old links and alerts,
     and the bank is Money, one level up. */
  var EXTRA = ['due.html', TODO, MONEY];
  /* Pages a company keeps reachable without a tab: the old pipeline, which
     Verge's and CoolRight's new boards replaced, stays for anyone with it bookmarked. */
  var ALSO = { roofing: ['pipeline.html'], ac: ['pipeline.html'] };

  function stored() { try { return global.localStorage.getItem(KEY); } catch (e) { return null; } }
  function remember(a) { try { global.localStorage.setItem(KEY, a); } catch (e) {} }

  var page = global.location.pathname.split('/').pop() || CALENDAR;
  var fromUrl = new URLSearchParams(global.location.search).get('area');
  /* Today and Settings belong to no one company: they show them all. The
     to-do list is both: under a company it is that company's list, and with
     no company in the address it is everything. */
  var overall = page === CALENDAR || page === SETTINGS || (page === TODO && !AREAS[fromUrl]);
  var area = AREAS[fromUrl] ? fromUrl : (AREAS[stored()] ? stored() : 'damp');
  if (!overall) remember(area);

  function href(a, file) { return '/staff/' + file + '?area=' + a; }
  function first(a) { return AREAS[a].tabs[0][1]; }
  function hasPage(a, file) { return EXTRA.indexOf(file) !== -1 || (ALSO[a] || []).indexOf(file) !== -1 || AREAS[a].tabs.some(function (t) { return t[1] === file; }); }

  /* A page this company does not have, such as Jobs under Verge, goes to the
     company's first section rather than showing another business's screen. */
  if (!overall && !hasPage(area, page)) { global.location.replace(href(area, first(area))); return; }

  var root = document.documentElement;
  if (!overall) root.setAttribute('data-area', area);

  function link(text, to, current, cls) {
    var a = document.createElement('a');
    a.href = to;
    a.textContent = text;
    if (cls) a.className = cls;
    if (current) a.setAttribute('aria-current', 'page');
    return a;
  }

  /* The top bar: Today, one link per company, Money and the Settings cog. */
  function drawCompanies(allowed) {
    var nav = document.querySelector('nav.tabs');
    if (!nav) return;
    nav.textContent = '';
    nav.setAttribute('aria-label', 'Main');
    nav.appendChild(link('Today', '/staff/' + CALENDAR, page === CALENDAR || page === 'due.html' || page === TODO, 'co-tab co-tab--today'));
    allowed.forEach(function (a) {
      nav.appendChild(link(AREAS[a].name, href(a, first(a)), !overall && a === area && EXTRA.indexOf(page) === -1, 'co-tab co-tab--' + a));
    });
    /* Money (the bank, admin only on the server) and Settings are drawn once
       /api/admin/me says this person may have them, so somebody who only
       works on a business never sees either, not even for a moment. */
    if (rights.money) nav.appendChild(link('Money', href(allowed.indexOf(area) !== -1 ? area : allowed[0], MONEY), page === MONEY, 'co-tab co-tab--money'));
    if (rights.settings) {
      var cog = link('\u2699', '/staff/' + SETTINGS, page === SETTINGS, 'co-tab co-tab--settings');
      cog.setAttribute('aria-label', 'Settings');
      cog.title = 'Settings';
      nav.appendChild(cog);
    }
    held = allowed;
  }
  var held = ORDER;
  var rights = { money: false, settings: false, manages: {} };

  /* The row under it: the chosen company's own sections. On Money it is the
     company filter instead, since the books are kept per company. */
  function drawSections() {
    if (overall || page === 'due.html' || page === TODO) return;
    var header = document.querySelector('header.top');
    if (!header) return;
    var old = document.querySelector('nav.section-tabs');
    if (old) old.remove();
    var bar = document.createElement('nav');
    bar.className = 'section-tabs';
    if (page === MONEY) {
      bar.setAttribute('aria-label', 'Money for');
      held.forEach(function (a) { bar.appendChild(link(AREAS[a].name, href(a, MONEY), a === area, 'section-tab')); });
    } else {
      bar.setAttribute('aria-label', AREAS[area].name + ' sections');
      /* Jobs (earnings), Lab and Scheduling (enquiry contact details): only for
         whoever manages a damp brand. */
      AREAS[area].tabs.forEach(function (t) {
        if ((t[1] === 'jobs.html' || t[1] === 'lab.html' || t[1] === 'schedule.html') && rights.known && !AREAS[area].sites.some(function (x) { return rights.manages[x]; })) return;
        bar.appendChild(link(t[0], href(area, t[1]), t[1] === page, 'section-tab'));
      });
    }
    header.parentNode.insertBefore(bar, header.nextSibling);
  }

  /* The header lockup is the business you are working in. The damp area keeps
     the hostname's DampScan or ATi mark; the other two wear their own. */
  function drawLogo() {
    if (area === 'damp') return;
    var logos = document.querySelectorAll('header.top > a.logo');
    if (!logos.length) return;
    var a = document.createElement('a');
    a.href = area === 'roofing' ? 'https://vergeroofing.com/' : 'https://coolright.co.uk/';
    a.className = 'logo logo--' + area;
    a.setAttribute('aria-label', AREAS[area].name + ' website');
    if (area === 'roofing') {
      var img = document.createElement('img');
      img.src = '/assets/verge-logo.png'; img.alt = ''; img.width = 103; img.height = 32;
      a.appendChild(img);
    } else {
      var word = document.createElement('span');
      word.className = 'logo-word';
      word.appendChild(document.createTextNode('Cool'));
      var right = document.createElement('span');
      right.className = 'scan';
      right.textContent = 'Right';
      word.appendChild(right);
      a.appendChild(word);
    }
    logos[0].parentNode.insertBefore(a, logos[0]);
    logos.forEach(function (l) { l.remove(); });
    document.title = document.title.replace(/DampScan|ATi Damp Survey/, AREAS[area].name);
  }

  /* Brand pills outside the area come off the page. An area of one brand has
     no use for brand pills at all, so the row goes. */
  function trimPills() {
    var sites = AREAS[area].sites;
    document.querySelectorAll('[data-site]').forEach(function (pill) {
      var s = pill.getAttribute('data-site');
      if (s && sites.indexOf(s) === -1) pill.remove();
      else if (!s && sites.length > 1) pill.textContent = 'Both brands';
    });
    if (sites.length === 1) {
      document.querySelectorAll('[data-site]').forEach(function (pill) {
        var row = pill.closest('.pills, [role="group"]');
        if (row) row.hidden = true; else pill.remove();
      });
    }
  }

  /* Which companies this person holds, once /api/admin/me says. Until then
     the top bar shows all three, which is what most people with access see. */
  async function trimCompanies() {
    var me;
    try { me = await global.DSUI.get('/api/admin/me'); } catch (e) { return; }
    var held = {};
    (me.businesses || []).forEach(function (b) { held[b.slug] = true; });
    rights = { known: true, money: Boolean(me.isAdmin), manages: {} };
    (me.businesses || []).forEach(function (b) { if (me.isAdmin || b.level === 'manage') rights.manages[b.slug] = true; });
    rights.settings = Boolean(me.isAdmin) || Object.keys(rights.manages).length > 0;
    global.DSAREA.rights = rights;
    var allowed = ORDER.filter(function (a) { return AREAS[a].sites.some(function (s) { return held[s]; }); });
    if (!allowed.length) return;
    if (!overall && allowed.indexOf(area) === -1) { remember(allowed[0]); global.location.replace(href(allowed[0], first(allowed[0]))); return; }
    drawCompanies(allowed);
    drawSections();
    global.DSAREA.held = allowed.slice();
    global.DSAREA.me = me;
    document.dispatchEvent(new CustomEvent('ds:me', { detail: me }));
  }

  drawCompanies(ORDER);
  drawSections();
  if (!overall) { drawLogo(); trimPills(); }
  trimCompanies();

  /* Phone notifications and the shared shell (search, the + button, the
     phone's bottom bar and the page-view count): their own files, loaded
     after the page so neither holds it up. */
  ['/staff/push.js', '/staff/shell.js'].forEach(function (src) {
    var tag = document.createElement('script');
    tag.src = src;
    tag.defer = true;
    document.head.appendChild(tag);
  });

  global.DSAREA = {
    area: overall ? null : area,
    name: overall ? 'All companies' : AREAS[area].name,
    sites: overall ? [] : AREAS[area].sites.slice(),
    books: overall ? null : AREAS[area].books,
    page: page,
    held: ORDER.slice(),
    names: { damp: AREAS.damp.name, roofing: AREAS.roofing.name, ac: AREAS.ac.name },
    first: first,
    /* The routes that narrow by company. The calendar asks for every company
       the person holds, so nothing is added to its requests. */
    scoped: overall ? /(?!)/ : /^\/api\/admin\/(leads|summary|due|clients|jobs|quoted|contracts|calendar|insights|surveys|roofing|coolright)\b/
  };
})(window);
