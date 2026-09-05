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

  const fields = document.getElementById('f-addr-fields');
  const chosen = document.getElementById('f-addr-chosen');
  const chosenText = document.getElementById('f-addr-chosen-text');
  const change = document.getElementById('f-addr-change');

  const lookupRow = find.closest('.addr-find');
  const form = find.closest('form');

  let last = '';
  /* The provider's own spelling of the postcode it matched, which is the one
     worth keeping: normalised casing and spacing, whatever they typed. */
  let found = '';

  /* Remembered across the session, so a visitor who reaches step 3 twice does
     not see a Find address button that has already been shown to do nothing.
     Wrapped because storage access throws in some private modes. */
  const OFF_KEY = 'ds_addr_off';
  const remember = (v) => { try { sessionStorage.setItem(OFF_KEY, v); } catch (e) {} };
  const recalled = () => { try { return sessionStorage.getItem(OFF_KEY) === '1'; } catch (e) { return false; } };

  /* No provider means the lookup row is a button that cannot work. Removing it
     leaves three ordinary fields, which is the form as it was before any of
     this existed and the right thing to show. */
  function switchOff(){
    remember('1');
    if (lookupRow) lookupRow.hidden = true;
    say('');
    if (document.activeElement === pcField) document.getElementById('f-addr1').focus();
  }
  if (recalled() && lookupRow) lookupRow.hidden = true;

  /* Collapse the three fields down to the one line they add up to. Only ever
     reached after a successful pick, so somebody typing their own address
     never has it taken away from them mid-sentence. */
  function collapse(label){
    if (!fields || !chosen) return;
    chosenText.textContent = label;
    chosen.hidden = false;
    fields.hidden = true;
    /* The select that had focus is hidden now, and focus that lands on body
       is a screen reader user losing their place. The chosen line reads out
       the address and the Change button after it. */
    chosen.focus();
  }

  function expand(focus){
    if (!fields || !chosen) return;
    chosen.hidden = true;
    fields.hidden = false;
    if (focus) document.getElementById('f-addr1').focus();
  }

  if (change) change.addEventListener('click', () => expand(true));

  /* Whatever they gave at step 1 is almost always the same postcode, so it is
     copied across rather than asked for twice. Two boxes want it: the one the
     lookup searches on, and the postcode that forms part of the address. */
  const step1 = document.getElementById('f-postcode');
  const addrPc = document.getElementById('f-addr-postcode');
  const copied = new Map();
  function copyInto(field){
    if (!step1 || !field) return;
    const theirs = field.value.trim();
    /* Overwrite when the box is empty or still holds what we put there. A
       postcode they typed into this box themselves is left alone. */
    if (theirs && theirs !== copied.get(field)) return;
    const from = step1.value.trim();
    copied.set(field, from);
    field.value = from;
  }
  function syncFromStep1(){ copyInto(pcField); copyInto(addrPc); }
  if (step1) step1.addEventListener('change', syncFromStep1);

  function say(text){ status.textContent = text || ''; }

  function fill(a){
    /* One street field now, so the sub-building part joins line 1 rather than
       being dropped: "Flat 2" in front of the street is the difference between
       a surveyor finding the door and knocking on the wrong one. */
    document.getElementById('f-addr1').value = [a.line1, a.line2].filter(Boolean).join(', ');
    document.getElementById('f-town').value = a.town || '';
    if (addrPc && found) { addrPc.value = found; copied.set(addrPc, found); }
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
    if (!a) return;
    fill(a);
    pick.hidden = true;
    say('');
    collapse([a.label, found].filter(Boolean).join(', '));
  });

  /**
   * @param {boolean} asked  true for a click or Enter, false when the lookup
   *   runs by itself on arriving at step 3. An unasked lookup that finds
   *   nothing says nothing: the fields are already there to type into, and a
   *   message about a search nobody started is just noise.
   */
  function lookup(asked){
    const pc = pcField.value.trim() || (step1 ? step1.value.trim() : '');
    if (!pc) { if (asked) { say('Enter a postcode first.'); pcField.focus(); } return; }
    /* Same postcode twice is only worth skipping when it already produced a
       list. After a failure the second click has to be a real retry, or the
       button appears broken. */
    if (pc === last && !pick.hidden) return;
    if (!asked && pc === last) return;
    last = pc;
    pcField.value = pc;
    find.disabled = true;
    say('Looking up addresses…');
    const focusWas = document.activeElement;

    fetch('/api/address?postcode=' + encodeURIComponent(pc), { headers: { Accept: 'application/json' } })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data && data.configured === false) { switchOff(); return; }
        found = (data && data.postcode) || pc;
        const list = data && Array.isArray(data.addresses) ? data.addresses : [];
        if (!list.length) {
          /* No results, or a provider having a bad day. To the visitor they
             are the same thing. */
          pick.hidden = true;
          expand(false);
          say(asked ? 'Please type the address below.' : '');
          if (asked) document.getElementById('f-addr1').focus();
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
        /* Only take focus if the visitor has not moved on since. An automatic
           lookup that yanks them out of the field they are typing in is worse
           than one they have to reach for. */
        if (asked || document.activeElement === focusWas || document.activeElement === pcField) select.focus();
      })
      .catch(() => { pick.hidden = true; expand(false); say(asked ? 'Please type the address below.' : ''); })
      .then(() => { find.disabled = false; });
  }

  find.addEventListener('click', () => lookup(true));

  /* Enter in the postcode box means find, not book. Without this it reaches
     the only submit button on the form, which is the one on this step. */
  pcField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); lookup(true); }
  });

  /* Arriving at step 3 with a postcode from step 1 is the moment somebody
     wants their address listed, so it is listed without being asked. */
  if (form) {
    form.addEventListener('ds:step', (e) => {
      if (e.detail.step !== 3) return;
      /* Ahead of the recalled() check on purpose: with no provider there is no
         lookup to run, but the address postcode still wants filling in, and
         that is the case where it matters most. */
      syncFromStep1();
      if (recalled()) return;
      lookup(false);
    });
  }
})();
