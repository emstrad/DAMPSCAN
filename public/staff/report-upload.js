/* A finished report from the phone or laptop straight to storage, then saved
   on its job (lib/report-file.js). Shared by the client card and the
   Reports page. Resolves to the saved file name; throws words to show. */
(function (global) {
  'use strict';
  var U = global.DSUI;
  var DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  /* slot 2 is the survey's second report (rare), kept beside the first. */
  async function upload(jobId, file, slot) {
    if (file.size > 25 * 1024 * 1024) throw new Error('That file is over 25MB.');
    var type = /\.docx$/i.test(file.name) ? DOCX : 'application/pdf';
    try {
      var ticket = await U.send('/api/admin/clients', { id: jobId, reportUpload: { name: file.name, type: type } });
      if (!ticket.ok) throw new Error(ticket.data && ticket.data.error);
      var put = await fetch(ticket.data.url, { method: 'PUT', headers: { 'Content-Type': type }, body: file });
      if (!put.ok) throw new Error('The upload did not finish. Try again.');
      var saved = await U.send('/api/admin/clients', Object.assign({ id: jobId, reportPath: ticket.data.path, reportName: file.name }, slot === 2 ? { reportSlot: 2 } : {}));
      if (!saved.ok) throw new Error(saved.data && saved.data.error);
      return slot === 2 ? saved.data.reportFile2 : saved.data.reportFile;
    } catch (e) {
      throw new Error(e && e.message && !/Request failed/.test(e.message) ? e.message : 'Could not upload the report. Try again.');
    }
  }

  global.DSREPORT = { upload: upload };
})(window);
