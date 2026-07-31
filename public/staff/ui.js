/* Shared rendering primitives for the staff dashboard. Plain script, exposed on
   window.DSUI, so there is no bundler and no module loading to go wrong. */
(function (global) {
  'use strict';

  var nf = new Intl.NumberFormat('en-GB');

  /* Build nodes with textContent, never innerHTML with data in it. Lead notes,
     referrers and campaign names are visitor-supplied, so treating any of them
     as markup would turn this dashboard into a stored XSS sink. */
  function node(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }

  function num(v) { return nf.format(Number(v || 0)); }

  function pct(v) { return (Math.round(Number(v || 0) * 10) / 10) + '%'; }

  function when(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London'
    });
  }

  /* A 401 means the session expired, so send the viewer back to the login page. */
  async function get(path) {
    var res = await fetch(path, { headers: { Accept: 'application/json' } });
    if (res.status === 401) { global.location.replace('/staff'); throw new Error('unauthorised'); }
    if (!res.ok) throw new Error('Request failed (' + res.status + ')');
    return await res.json();
  }

  /**
   * Renders rows into `mount`. Each column supplies a `get(row)` returning either
   * a string or a Node, so a cell can hold a tag without any HTML string building.
   */
  function table(mount, columns, rows, options) {
    var opts = options || {};
    mount.textContent = '';
    if (!rows.length) {
      mount.appendChild(node('p', 'empty', opts.empty || 'Nothing recorded in this period.'));
      return;
    }

    var t = document.createElement('table');
    var thead = document.createElement('thead');
    var hr = document.createElement('tr');
    columns.forEach(function (col) {
      hr.appendChild(node('th', col.numeric ? 'num' : null, col.label));
    });
    thead.appendChild(hr);
    t.appendChild(thead);

    var tbody = document.createElement('tbody');
    rows.forEach(function (row, index) {
      var tr = document.createElement('tr');
      columns.forEach(function (col) {
        var td = document.createElement('td');
        if (col.numeric) td.className = 'num';
        if (col.wrap) td.className = 'wrap-cell';
        var value = col.get(row);
        if (value instanceof Node) td.appendChild(value);
        else td.textContent = value === null || value === undefined ? '' : String(value);
        tr.appendChild(td);
      });
      if (opts.onRow) opts.onRow(tr, row, index);
      tbody.appendChild(tr);
    });
    t.appendChild(tbody);

    var wrap = node('div', 'tw');
    wrap.appendChild(t);
    mount.appendChild(wrap);
  }

  /* Pence in, pounds out. The server deals only in whole pence; pounds are a
     display format and never go back the other way without being converted. */
  function money(pence) {
    return (Number(pence || 0) / 100).toLocaleString('en-GB', {
      style: 'currency', currency: 'GBP'
    });
  }

  /** Pounds typed by a person to whole pence. "1,234.56" and " 12 " both work. */
  function toPence(value) {
    var cleaned = String(value === null || value === undefined ? '' : value).replace(/[\s,\u00a3]/g, '');
    if (cleaned === '') return 0;
    var n = Number(cleaned);
    return Number.isFinite(n) ? Math.round(n * 100) : null;
  }

  /* Writes return their body either way: a 400 carries the field errors the
     form needs to show, so it is not an exception. */
  async function send(path, body, method) {
    var res = await fetch(path, {
      method: method || 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body || {})
    });
    if (res.status === 401) { global.location.replace('/staff'); throw new Error('unauthorised'); }
    var data = await res.json().catch(function () { return null; });
    if (!res.ok && res.status !== 400) throw new Error('Request failed (' + res.status + ')');
    return { ok: res.ok, status: res.status, data: data };
  }

  function csvCell(value) {
    if (value === null || value === undefined) return '""';
    var s = String(value);
    // A leading =, +, - or @ makes a spreadsheet treat the cell as a formula, so
    // a lead could otherwise smuggle one in through the notes field.
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }

  /** Builds a CSV from [header, getter] pairs and triggers a download. */
  function downloadCsv(filename, columns, rows) {
    var lines = [columns.map(function (c) { return csvCell(c[0]); }).join(',')];
    rows.forEach(function (row) {
      lines.push(columns.map(function (c) { return csvCell(c[1](row)); }).join(','));
    });
    // Leading BOM so Excel opens UTF-8 correctly.
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  global.DSUI = {
    node: node, num: num, pct: pct, when: when, get: get, send: send,
    money: money, toPence: toPence,
    table: table, csvCell: csvCell, downloadCsv: downloadCsv
  };
})(window);
