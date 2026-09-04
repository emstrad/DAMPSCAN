/**
 * Postcode to address lookup on the booking form.
 *
 * The typed fields are the truth and this only fills them in. A provider that
 * is unconfigured, slow, wrong or down therefore costs the visitor nothing:
 * they type the address exactly as they would have anyway. That is why there
 * is no error state to speak of, and why "no key" and "no results" and "the
 * lookup fell over" all end at the same sentence.
 *
 * Separate from book.js because that file is already the one documented
 * exception to the size rule in this repository, and making it worse to hold
 * a self contained feature would be the wrong trade.
 */
(function addressLookup(){
  const find = document.getElementById('f-addr-find');
  const pcField = document.getElementById('f-addr-pc');
  const status = document.getElementById('f-addr-status');
  const pick = document.getElementById('f-addr-pick');
  const select = document.getElementById('f-addr-select');
  if (!find || !pcField || !select) return;

  let last = '';

  /* Whatever they gave at step 1 is almost always the same postcode, so it
     is copied across rather than asked for twice. */
  const step1 = document.getElementById('f-postcode');
  if (step1) {
    step1.addEventListener('change', () => { if (!pcField.value.trim()) pcField.value = step1.value; });
  }

  function say(text){ status.textContent = text || ''; }

  function fill(a){
    document.getElementById('f-addr1').value = a.line1 || '';
    document.getElementById('f-addr2').value = a.line2 || '';
    document.getElementById('f-town').value = a.town || '';
    /* Clearing the row here rather than calling into book.js, because this
       file has to stand on its own. */
    const row = document.getElementById('f-addr1').closest('.form-row');
    if (row) {
      row.classList.remove('has-err');
      row.querySelectorAll('[aria-invalid]').forEach((el) => el.setAttribute('aria-invalid', 'false'));
    }
  }

  select.addEventListener('change', () => {
    const a = select.options[select.selectedIndex] && select.options[select.selectedIndex]._addr;
    if (a) fill(a);
  });

  find.addEventListener('click', () => {
    const pc = pcField.value.trim() || (step1 ? step1.value.trim() : '');
    if (!pc) { say('Enter a postcode first.'); pcField.focus(); return; }
    /* Same postcode twice is only worth skipping when it already produced a
       list. After a failure the second click has to be a real retry, or the
       button appears broken. */
    if (pc === last && !pick.hidden) return;
    last = pc;
    pcField.value = pc;
    find.disabled = true;
    say('Looking up addresses…');

    fetch('/api/address?postcode=' + encodeURIComponent(pc), { headers: { Accept: 'application/json' } })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        const list = data && Array.isArray(data.addresses) ? data.addresses : [];
        if (!list.length) {
          /* No key, no results, or a provider having a bad day. All three end
             the same way, because to the visitor they are the same thing. */
          pick.hidden = true;
          say('Please type the address below.');
          document.getElementById('f-addr1').focus();
          return;
        }
        select.innerHTML = '';
        const first = document.createElement('option');
        first.textContent = list.length + ' addresses found, choose one…';
        first.disabled = true;
        first.selected = true;
        select.appendChild(first);
        list.forEach(a => {
          const opt = document.createElement('option');
          opt.textContent = a.label;
          opt._addr = a;
          select.appendChild(opt);
        });
        pick.hidden = false;
        say('');
        select.focus();
      })
      .catch(() => { pick.hidden = true; say('Please type the address below.'); })
      .then(() => { find.disabled = false; });
  });
})();
