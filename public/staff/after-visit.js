/* After the visit, on the Scheduling page: the two Surveys board columns that
   need someone (surveyed and not paid; paid with the report still to send),
   from the same /api/admin/surveys data, so the page shows a survey's whole
   life in one place. A card opens the full job, where it is marked paid or
   the report sent, exactly as on Today and the Surveys board. */
(function (global) {
  'use strict';
  var U = global.DSUI;
  var LANES = [['surveyed', 'Surveyed, not paid'], ['paid', 'Paid, report to send']];

  function card(s, reload) {
    var b = U.node('button', 'dsp-item is-survey ' + (s.stage === 'paid' ? 'is-paid' : 'is-owed')); b.type = 'button';
    b.appendChild(U.node('span', 'dsp-time', s.date ? new Date(s.date + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : ''));
    var m = U.node('span', 'dsp-main');
    m.appendChild(U.node('span', 'dsp-title', (s.name || 'No name') + (s.postcode ? ', ' + s.postcode : '')));
    var sub = [s.surveyor ? s.surveyor.charAt(0).toUpperCase() + s.surveyor.slice(1) : null, s.surveyLabel];
    if (s.stage === 'paid' && s.reportDays != null) sub.push(s.reportLate ? 'report late, ' + s.reportDays + ' days' : 'report owed ' + s.reportDays + ' days');
    if (s.stage === 'surveyed') sub.push(s.deposit ? 'deposit paid, balance owed' : 'nothing paid yet');
    m.appendChild(U.node('span', 'dsp-sub' + (s.reportLate ? ' tl-clash' : ''), sub.filter(Boolean).join(' · ')));
    b.appendChild(m);
    b.addEventListener('click', function () { if (global.DSPOP) global.DSPOP.open(s.id, { onChange: reload }); });
    return b;
  }

  async function render(mount, reload) {
    try {
      var d = await U.get('/api/admin/surveys');
      mount.textContent = '';
      LANES.forEach(function (l) {
        var items = (d.surveys || []).filter(function (s) { return s.stage === l[0]; });
        var col = U.node('section', 'sched-col');
        var h = U.node('h2', null, l[1]); h.appendChild(U.node('span', 'tag', String(items.length)));
        col.appendChild(h);
        items.forEach(function (s) { col.appendChild(card(s, reload)); });
        if (!items.length) col.appendChild(U.node('p', 'panel-note', 'Nothing here.'));
        mount.appendChild(col);
      });
    } catch (e) { if (e.message !== 'unauthorised') mount.textContent = 'Could not load the surveys.'; }
  }
  global.DSAFTER = { render: render };
})(window);
