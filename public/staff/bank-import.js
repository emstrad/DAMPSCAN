/* Uploading a statement and taking one out again. The file is read in the
   browser and posted as text, so nothing here needs a multipart parser on the
   server. Loaded before bank.js, which wires it up with a refresh function. */
(function (global) {
  'use strict';

  var U = global.DSUI;
  var el = function (id) { return document.getElementById(id); };
  var ctx = null;

  function plural(n, one, many) { return U.num(n) + ' ' + (n === 1 ? one : many); }

  function summary(r) {
    var bits = [plural(r.added, 'line added', 'lines added')];
    if (r.duplicates) bits.push(plural(r.duplicates, 'already here', 'already here'));
    if (r.matched) bits.push(plural(r.matched, 'payment matched to a job', 'payments matched to jobs'));
    if (r.skipped) {
      if (r.skipped.pending) bits.push(plural(r.skipped.pending, 'pending line skipped', 'pending lines skipped'));
      if (r.skipped.notGbp) bits.push(plural(r.skipped.notGbp, 'non-sterling line skipped', 'non-sterling lines skipped'));
      if (r.skipped.unreadable) bits.push(plural(r.skipped.unreadable, 'line could not be read', 'lines could not be read'));
    }
    return bits.join(', ') + '.';
  }

  async function upload(e) {
    e.preventDefault();
    var input = el('file');
    var file = input.files && input.files[0];
    if (!file) return;
    var button = el('import');
    var out = el('import-result');
    button.disabled = true;
    out.textContent = 'Importing ' + file.name + '…';

    try {
      var text = await file.text();
      var res = await fetch('/api/admin/bank?op=import&name=' + encodeURIComponent(file.name) + ctx.qs('&'), {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv', Accept: 'application/json' },
        body: text
      });
      if (res.status === 401) { global.location.replace('/staff'); return; }
      var data = await res.json().catch(function () { return null; });
      if (!res.ok || !data || !data.ok) {
        var why = data && data.error;
        out.textContent = why === 'not_a_statement'
          ? 'That does not look like a Revolut statement. Export it from Revolut as CSV and try again.'
          : why === 'too_large' ? 'That file is too large. Export a shorter period.'
            : why === 'empty' ? 'That file is empty.' : 'The import failed (' + res.status + ').';
        return;
      }
      out.textContent = summary(data);
      input.value = '';
      el('file-name').textContent = '';
      await ctx.refresh();
    } catch (err) {
      out.textContent = err.message || 'The import failed.';
    } finally {
      button.disabled = !(input.files && input.files.length);
    }
  }

  async function remove(statement) {
    var what = statement.lines === 1 ? 'its 1 line' : 'its ' + U.num(statement.lines) + ' lines';
    if (!global.confirm('Remove ' + (statement.filename || 'this upload') + ' and ' + what
      + '? Any job paid only by those lines is unticked again.')) return;
    var res = await U.send('/api/admin/bank' + ctx.qs('?'), { statementId: statement.id }, 'DELETE');
    el('import-result').textContent = res.ok ? 'Removed.' : 'That upload could not be removed.';
    await ctx.refresh();
  }

  function wire(c) {
    ctx = c;
    el('file').addEventListener('change', function () {
      var file = el('file').files[0];
      el('file-name').textContent = file ? file.name : '';
      el('import').disabled = !file;
    });
    el('upload-form').addEventListener('submit', upload);
  }

  global.DSBANKIMPORT = { wire: wire, remove: remove };
})(window);
