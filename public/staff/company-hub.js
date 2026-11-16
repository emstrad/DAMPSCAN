/* The Company hub's tab row on the pages it took in for ATi and DampScan
   (the owners' plan, 15 Nov 2026): Website (the Leads page), Insights and
   Records keep their own screens but sit under Company, so the row here is
   the same as on company.html. Other companies keep these as their own tabs. */
(function (global) {
  'use strict';
  var A = global.DSAREA;
  if (!A || A.area !== 'damp') return;
  var TABS = [['Overview', 'company.html'], ['Pay', 'company.html#pay'], ['Money', 'company.html#money'], ['Bank check', 'company.html#bank'],
    ['Growth', 'company.html#growth'], ['Week', 'company.html#week'], ['Website', 'dashboard.html'], ['Insights', 'insights.html'], ['Records', 'records.html']];
  var main = document.querySelector('main');
  if (!main) return;
  var row = document.createElement('nav');
  row.className = 'pills co-tabs';
  row.setAttribute('aria-label', 'Company');
  row.style.margin = '4px 0 16px';
  TABS.forEach(function (t) {
    var a = document.createElement('a');
    a.className = 'pill';
    a.href = '/staff/' + t[1].replace(/(\.html)/, '$1?area=damp');
    a.textContent = t[0];
    a.style.display = 'inline-flex'; a.style.alignItems = 'center'; a.style.textDecoration = 'none';
    var on = t[1] === A.page;
    a.setAttribute('aria-pressed', String(on));
    if (on) a.setAttribute('aria-current', 'page');
    row.appendChild(a);
  });
  main.insertBefore(row, main.firstChild);
})(window);
