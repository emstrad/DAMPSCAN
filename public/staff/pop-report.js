/* The report, inside the job pop-up (the owner's ask, 13 Nov 2026): the same
   upload, Report ready and Hold as the Reports page (the surveys route, so
   the texts and their page follow exactly as there), and Report sent, so a
   survey can be finished from wherever the customer is opened. Report ready
   texts them (report ready, or "your report" once paid) and unlocks it on
   their page once paid in full; Hold locks it and stops the texts. */
(function (global) {
  'use strict';
  var U = global.DSUI;

  function loadUpload() {
    if (global.DSREPORT) return Promise.resolve();
    return new Promise(function (ok, bad) { var s = document.createElement('script'); s.src = '/staff/report-upload.js'; s.onload = ok; s.onerror = bad; document.head.appendChild(s); });
  }
  function btn(text, cls, fn) { var b = U.node('button', cls, text); b.type = 'button'; b.addEventListener('click', fn); return b; }

  function render(j, section, tick, changed) {
    var r = j.report || {};
    var surveyed = j.status === 'completed' || (j.dateSet && j.date && j.date <= new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }));
    var title = j.reportSent ? 'Report (sent)' : r.ready ? 'Report (ready' + (r.held ? ', on hold)' : ')') : r.file ? 'Report (uploaded)' : 'Report';
    var s = section(title, surveyed && !j.reportSent && !r.ready ? 'open' : 'closed');
    var first = String(j.customerName || '').trim().split(/\s+/)[0] || 'them';
    var said = U.node('p', 'panel-note');
    var row = U.node('div', 'sheet-row');

    if (r.file) {
      var a = U.node('a', 'pill', 'Open ' + r.file);
      a.href = '/api/admin/attachment?report=' + j.id;
      row.appendChild(a);
    }
    var lab = U.node('label', 'pill', r.file ? 'Replace the file' : 'Upload the report');
    var input = document.createElement('input');
    input.type = 'file'; input.accept = 'application/pdf,.pdf,.docx'; input.hidden = true;
    input.addEventListener('change', async function () {
      if (!input.files[0]) return;
      said.textContent = 'Uploading…';
      try { await loadUpload(); await global.DSREPORT.upload(j.id, input.files[0]); said.textContent = 'Uploaded.'; changed(); }
      catch (e) { said.textContent = e.message || 'Could not upload it. Try again.'; }
    });
    lab.appendChild(input);
    row.appendChild(lab);
    s.appendChild(row);

    async function report(change, words) {
      said.textContent = 'Saving…';
      var res;
      try { res = await U.send('/api/admin/surveys', Object.assign({ op: 'report', id: j.id }, change)); } catch (e) { res = { ok: false }; }
      said.textContent = res.ok ? words : 'Not saved (managers only). Try again.';
      if (res.ok) changed();
    }
    /* Report ready and Hold are the managers' (the server refuses anyone else); a surveyor uploads and ticks Report sent. */
    var R = global.DSAREA && global.DSAREA.rights;
    var boss = !R || !R.known || R.manages[j.site];
    if (boss && (r.file || r.ready)) {
      var acts = U.node('div', 'sheet-row');
      var texts = j.textsOn && !r.held;
      acts.appendChild(btn(r.ready ? 'Ready ✓ (tap to undo)' : 'Report ready' + (texts ? ' (texts ' + first + ' in 2 min)' : ''), 'btn btn--sm' + (r.ready ? ' is-on' : ' btn--primary'), function () {
        report({ ready: !r.ready }, r.ready ? 'Not ready.' : r.held ? 'Ready, on hold: nothing sent.' : 'Ready.' + (texts ? ' ' + first + ' gets a text in 2 minutes.' : ''));
      }));
      acts.appendChild(btn(r.held ? 'On hold: let go' : 'Hold', 'btn btn--ghost btn--sm' + (r.held ? ' is-on' : ''), function () {
        report({ hold: !r.held }, r.held ? 'Let go.' : 'On hold: locked on their page, no texts.');
      }));
      s.appendChild(acts);
      s.appendChild(U.node('p', 'meta', r.held ? 'Locked on their page until let go.' : r.ready ? (j.paid ? 'Unlocked on their page.' : 'On their page, unlocked once paid in full.') : 'Not on their page until Report ready.'));
    }
    s.appendChild(tick(j, 'surveySent', 'Report sent', j.reportSent, 'Report marked sent.'));
    s.appendChild(said);
  }

  global.DSPOPREPORT = { render: render };
})(window);
