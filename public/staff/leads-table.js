/* The leads table: its columns, the panel a row expands into, and the CSV
   export of the current page.

   Split out of dashboard.js when that file crossed the 300 line limit the rest
   of the project keeps to. The seam is a real one rather than a convenience:
   everything here is about one table of rows, and dashboard.js is about the
   aggregate numbers above it. The only coupling left is this object. */
(function leadsTable(){
  'use strict';

  var node = DSUI.node, num = DSUI.num, when = DSUI.when, table = DSUI.table;

  function el(id){ return document.getElementById(id); }

  /* The blobs are private, so a link points at our own authenticated route
     rather than at the store. Nothing here is clickable for a signed-out
     browser, and the route checks the path belongs to a real lead. */
  function attachments(lead){
    var wrap = node('div', 'attachments');
    wrap.appendChild(node('h4', null, 'Attachments'));
    var ul = document.createElement('ul');
    (lead.files || []).forEach(function(path){
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = '/api/admin/attachment?path=' + encodeURIComponent(path);
      a.textContent = path.split('/').pop();
      a.rel = 'noopener';
      li.appendChild(a);
      ul.appendChild(li);
    });
    wrap.appendChild(ul);
    return wrap;
  }

  /* ---------- one lead's event timeline, shown when its row is expanded ---------- */
  function timelineRow(lead){
    var tr = document.createElement('tr');
    var td = document.createElement('td');
    /* Read off the column list rather than kept in step with it by hand. */
    td.colSpan = LEAD_COLUMNS.length;
    td.className = 'timeline';

    if ((lead.files || []).length) td.appendChild(attachments(lead));

    if (!lead.timeline.length) {
      td.appendChild(node('p', 'empty', 'No events recorded for this session.'));
    } else {
      var ol = document.createElement('ol');
      lead.timeline.forEach(function(ev){
        var li = document.createElement('li');
        li.appendChild(node('time', null, when(ev.createdAt)));
        var bits = [ev.type];
        if (ev.detail && Object.keys(ev.detail).length) {
          bits.push(Object.keys(ev.detail).map(function(k){ return k + '=' + ev.detail[k]; }).join(' '));
        }
        if (ev.channel) bits.push('via ' + ev.channel);
        li.appendChild(document.createTextNode(' ' + bits.join(' · ')));
        ol.appendChild(li);
      });
      td.appendChild(ol);
    }
    tr.appendChild(td);
    return tr;
  }

  function expandable(tr, lead){
    tr.className = 'is-clickable';
    tr.tabIndex = 0;
    tr.setAttribute('aria-expanded', 'false');
    var detail = null;

    function toggle(){
      if (detail) {
        detail.remove();
        detail = null;
        tr.setAttribute('aria-expanded', 'false');
        return;
      }
      detail = timelineRow(lead);
      tr.parentNode.insertBefore(detail, tr.nextSibling);
      tr.setAttribute('aria-expanded', 'true');
    }

    tr.addEventListener('click', toggle);
    tr.addEventListener('keydown', function(e){
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  }

  var LEAD_COLUMNS = [
    { label: 'When', get: function(r){ return when(r.createdAt); } },
    { label: 'Site', get: function(r){
        return node('span', 'tag ' + (r.site === 'ati-london' ? 'tag--accent' : 'tag--muted'),
          r.site === 'ati-london' ? 'London' : 'Kent');
      } },
    { label: 'Stage', get: function(r){
        return node('span', 'tag ' + (r.stage === 'complete' ? 'tag--good' : 'tag--muted'),
          r.stage === 'complete' ? 'Booked' : 'Partial');
      } },
    { label: 'Name', get: function(r){ return r.firstName; } },
    { label: 'Email', get: function(r){ return r.email; } },
    { label: 'Phone', get: function(r){ return r.phone; } },
    /* The whole address when the form got it, the postcode alone when it did
       not. A partial never reaches step 3, so it only ever has the postcode. */
    { label: 'Address', wrap: true, get: function(r){
        return [r.addressLine1, r.addressLine2, r.town, r.postcode].filter(Boolean).join(', ');
      } },
    { label: 'Files', get: function(r){
        var n = (r.files || []).length;
        return n ? node('span', 'tag tag--accent', n === 1 ? '1 file' : n + ' files') : '';
      } },
    { label: 'Issues', wrap: true, get: function(r){ return (r.issues || []).join(', '); } },
    /* Owner or landlord is not in the Role column any more: the form stopped
       asking in September 2026, so it would be blank on every new lead. The
       CSV export still carries it, so the leads that have one are not lost. */
    { label: 'Previous survey', get: function(r){
        return r.previousSurvey === null ? 'Not asked' : r.previousSurvey ? 'Yes' : 'No';
      } },
    { label: 'Channel', get: function(r){ return r.channel || 'unknown'; } },
    { label: 'Landing page', get: function(r){ return r.landingPage; } },
    { label: 'Campaign', get: function(r){ return r.utm && r.utm.utm_campaign; } },
    { label: 'Notes', wrap: true, get: function(r){ return r.notes; } },
    { label: 'Emailed', get: function(r){
        if (r.notifiedAt) return node('span', 'tag tag--good', 'Sent');
        return node('span', 'tag tag--muted', r.notifyError ? 'Failed' : 'Pending');
      } }
  ];

  function renderLeads(data){
    table(el('leads'), LEAD_COLUMNS, data.leads, {
      empty: 'No leads in this period.',
      onRow: function(tr, lead){ expandable(tr, lead); }
    });

    var shown = data.leads.length;
    el('page-info').textContent = shown
      ? 'Showing ' + (data.offset + 1) + ' to ' + (data.offset + shown) + ' of ' + num(data.total)
      : 'No rows';
    el('prev').disabled = data.offset <= 0;
    el('next').disabled = data.offset + shown >= data.total;
  }

  /* ---------- CSV export of the current page of leads ---------- */
  var CSV_COLUMNS = [
['id', function(l){ return l.id; }], ['created_at', function(l){ return l.createdAt; }], ['stage', function(l){ return l.stage; }], ['first_name', function(l){ return l.firstName; }], ['email', function(l){ return l.email; }], ['phone', function(l){ return l.phone; }], ['postcode', function(l){ return l.postcode; }], ['address_line1', function(l){ return l.addressLine1; }], ['address_line2', function(l){ return l.addressLine2; }], ['town', function(l){ return l.town; }], ['files', function(l){ return (l.files || []).length; }], ['issues', function(l){ return (l.issues || []).join('; '); }], ['role', function(l){ return l.role; }], ['previous_survey', function(l){ return l.previousSurvey === null ? '' : l.previousSurvey ? 'Yes' : 'No'; }], ['notes', function(l){ return l.notes; }], ['channel', function(l){ return l.channel; }], ['landing_page', function(l){ return l.landingPage; }], ['referrer', function(l){ return l.referrer; }], ['utm_source', function(l){ return l.utm && l.utm.utm_source; }], ['utm_medium', function(l){ return l.utm && l.utm.utm_medium; }], ['utm_campaign', function(l){ return l.utm && l.utm.utm_campaign; }], ['device', function(l){ return l.device; }], ['site', function(l){ return l.site; }], ['session_id', function(l){ return l.sessionId; }], ['notified_at', function(l){ return l.notifiedAt; }]
  ];

  function exportCsv(range, leads){
    if (!leads || !leads.length) return;
    var name = 'dampscan-leads-' + range + '-' + new Date().toISOString().slice(0, 10) + '.csv';
    DSUI.downloadCsv(name, CSV_COLUMNS, leads);
  }
  window.DSLEADS = { render: renderLeads, exportCsv: exportCsv };
})();
