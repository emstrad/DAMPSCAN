/**
 * What each brand's enquiry form asks, and what its server accepts.
 *
 * One list per brand, read by the build when it writes the form and by the
 * validator when a submission arrives, so the two cannot disagree. Before this
 * the form and the validator each carried DampScan's list, and a roofing
 * visitor could not submit without ticking "Damp" or "Mould".
 *
 * Keyed by the runtime site key, which is what lib/site.js derives from the
 * Host header and what the leads table stores. ATi's runtime key is
 * "ati-london" for historical reasons while the build calls it "ati", so the
 * lookup accepts both. Unknown keys throw rather than fall back: falling back
 * to DampScan is exactly the fault this file exists to remove.
 */
const DAMP_ISSUES = [
  'Damp',
  'Mould',
  'Timber / Woodworm',
  'Leak / Water damage',
  'Cold / condensation',
  'Not sure'
];

export const ENQUIRY = {
  dampscan: { issues: DAMP_ISSUES },
  'ati-london': { issues: DAMP_ISSUES },
  roofing: {
    issues: [
      'Leak or water coming in',
      'Slipped or missing tiles',
      'Flat roof',
      'Chimney or leadwork',
      'Guttering or fascias',
      'Storm damage',
      'Full re-roof',
      'Not sure'
    ]
  },
  ac: {
    issues: [
      'New air conditioning',
      'Repair or regas',
      'Servicing',
      'Several rooms',
      'Heating',
      'Ventilation or condensation',
      'Commercial',
      'Not sure'
    ]
  }
};

const ALIAS = { ati: 'ati-london' };

export function enquiryFor(key) {
  const entry = ENQUIRY[ALIAS[key] || key];
  if (!entry) throw new Error(`no enquiry definition for site "${key}"`);
  return entry;
}
