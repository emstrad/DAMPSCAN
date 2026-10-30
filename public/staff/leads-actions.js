/* Close, reopen and delete on each row of the Leads table.

   Its own file because leads-table.js is about showing rows and this is about
   changing them. Closing is for an enquiry dealt with some other way (booked
   elsewhere, spam, no answer): it stops the call-back nags but stays listed,
   greyed. Delete is for managers only and asks first, because it cannot be
   undone. The server checks both again; the buttons only spare a refusal. */
(function leadActions(){
  'use strict';

  var node = DSUI.node;
  var REASONS = ['booked elsewhere', 'not interested', 'spam', 'duplicate', 'no response', 'other'];
  var manages = {};
  var admin = false;

  DSUI.get('/api/admin/me').then(function(me){
    admin = Boolean(me && me.isAdmin);
    ((me && me.businesses) || []).forEach(function(b){ if (b.level === 'manage') manages[b.slug] = true; });
  }).catch(function(){});

  async function change(body){
    var res = await fetch('/api/admin/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    });
    if (res.status === 401) { location.replace('/staff'); return; }
    var data = await res.json().catch(function(){ return null; });
    if (!res.ok) { alert((data && data.error) || 'That did not save. Try again.'); return; }
    if (window.DSLEADS && DSLEADS.onChange) DSLEADS.onChange();
  }

  function button(label, cls, onClick){
    var b = node('button', 'btn btn--sm ' + cls, label);
    b.type = 'button';
    b.addEventListener('click', function(e){ e.stopPropagation(); onClick(b); });
    return b;
  }

  /* The reason picker opens in place of the Close button, so a phone needs no dialog. */
  function picker(wrap, lead){
    wrap.textContent = '';
    var sel = document.createElement('select');
    sel.setAttribute('aria-label', 'Why close it');
    sel.addEventListener('click', function(e){ e.stopPropagation(); });
    REASONS.forEach(function(r){ var o = document.createElement('option'); o.value = r; o.textContent = r; sel.appendChild(o); });
    wrap.appendChild(sel);
    wrap.appendChild(button('Close it', 'btn--ghost', function(){
      var reason = sel.value;
      if (reason === 'other') reason = (prompt('Why is it closed?') || '').trim() || 'other';
      change({ op: 'close', id: lead.id, reason: reason });
    }));
  }

  /* What goes in the Status cell: the status in words and the buttons for it. */
  function cell(lead){
    var wrap = node('span', 'lead-acts', '');
    var status = lead.status || 'open';
    var label = status === 'closed' ? 'Closed' + (lead.closedReason ? ': ' + lead.closedReason : '') : status === 'converted' ? 'Job made' : 'Open';
    wrap.appendChild(node('span', 'tag ' + (status === 'converted' ? 'tag--good' : status === 'closed' ? 'tag--muted' : 'tag--accent'), label));
    /* A part-finished damp form can still become a booking: onto Scheduling, its card opened. */
    if (status === 'open' && lead.stage === 'partial' && /^(dampscan|ati-london)$/.test(lead.site)) {
      wrap.appendChild(button('Book them', 'btn--primary', async function(b){
        b.disabled = true;
        var res = await fetch('/api/admin/leads', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ op: 'schedule', id: lead.id }) });
        var data = await res.json().catch(function(){ return null; });
        if (!res.ok || !data || !data.ok) { b.disabled = false; alert((data && data.error) || 'That did not save. Try again.'); return; }
        location.href = '/staff/schedule.html?area=damp#lead-' + data.id;
      }));
    }
    if (status === 'open') wrap.appendChild(button('Close', 'btn--ghost', function(){ picker(wrap, lead); }));
    if (status === 'closed') wrap.appendChild(button('Reopen', 'btn--ghost', function(){ change({ op: 'reopen', id: lead.id }); }));
    if (status !== 'converted' && (admin || manages[lead.site])) {
      wrap.appendChild(button('Delete', 'btn--ghost', function(){
        if (confirm('Delete the enquiry from ' + (lead.firstName || 'this visitor') + ' for good? This cannot be undone.')) change({ op: 'delete', id: lead.id });
      }));
    }
    return wrap;
  }

  window.DSLEADACTS = { cell: cell };
})();
