/**
 * What a bank line is, guessed from what Revolut says about it.
 *
 * Two layers. The rules in this file are the starting point: a garage is fuel,
 * HMRC is tax, a transfer to Tom is Tom's drawings. The second layer is the
 * bank_rules table, which remembers what a person chose for a description and
 * is applied first by the importer, so the built-in guess only ever fills a
 * gap that nobody has filled by hand.
 *
 * A guess at the category is cheap to be wrong about: it is a label. A guess
 * at the split moves money between people, so the importer only offers one
 * where the line itself says whose it is: a transfer to a partner by name, or
 * a payment to the taxman. Everything else waits to be split by hand, and the
 * page counts what is waiting.
 */
import { PEOPLE } from '../splits.js';

export const CATEGORIES = [
  { key: 'income', label: 'Customer payment', flow: 'in' },
  { key: 'capital', label: 'Money put in by a partner', flow: 'in' },
  { key: 'refund', label: 'Refund', flow: 'in' },
  { key: 'fuel', label: 'Fuel', flow: 'out' },
  { key: 'travel', label: 'Parking, tolls and travel', flow: 'out' },
  { key: 'materials', label: 'Materials', flow: 'out' },
  { key: 'tools', label: 'Tools and equipment', flow: 'out' },
  { key: 'vehicle', label: 'Vehicle', flow: 'out' },
  { key: 'insurance', label: 'Insurance', flow: 'out' },
  { key: 'advertising', label: 'Advertising', flow: 'out' },
  { key: 'software', label: 'Software and subscriptions', flow: 'out' },
  { key: 'phone', label: 'Phone and internet', flow: 'out' },
  { key: 'professional', label: 'Accountancy and professional fees', flow: 'out' },
  { key: 'fees', label: 'Bank fees and charges', flow: 'out' },
  { key: 'tax', label: 'Tax, paid to HMRC', flow: 'out' },
  { key: 'drawings', label: 'Drawings, paid out to a partner', flow: 'out' },
  { key: 'cash', label: 'Cash withdrawal', flow: 'out' },
  { key: 'transfer', label: 'Transfer between own accounts', flow: 'any' },
  { key: 'other', label: 'Other', flow: 'any' }
];

export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

/* Spend that is the business's rather than one person's. In the damp books,
   where the partners share costs, the importer splits these between everyone
   rather than leaving them to be clicked three at a time; every line is
   reviewed anyway and a rule learned by hand overrides the guess. */
export const SHARED_COST = ['fuel', 'travel', 'materials', 'tools', 'vehicle', 'insurance', 'advertising', 'software', 'phone', 'professional', 'fees'];

/* Merchant patterns, tested against the description, reference and
   counterparty together. Order matters: Google Ads has to be advertising
   before anything Google is software. */
const MERCHANTS = [
  ['tax', /\b(hmrc|h ?m revenue|revenue (and|&) customs|self ?assessment)\b/],
  ['advertising', /\b(google ?\*? ?ads|googleads|facebook|facebk|meta ads|meta platforms|checkatrade|trustatrader|rated people|mybuilder|bark\.com|yell\.com|yell ltd)\b/],
  ['fuel', /\b(bp|shell|esso|texaco|jet|gulf|murco|petrol|fuel|filling station|service station|mfg|applegreen|harvest energy|tesco pfs|sainsburys pfs|asda pfs|morrisons pfs)\b/],
  ['travel', /\b(parking|ringgo|paybyphone|justpark|ncp|apcoa|dart ?charge|dartford crossing|tfl|congestion|ulez|toll|trainline|southeastern|thameslink|national rail|uber|bolt)\b/],
  ['materials', /\b(travis perkins|jewson|selco|wickes|b ?& ?q|b and q|buildbase|mkm|huws gray|safeguard|permagard|twistfix|sovereign chemicals|dryzone|delta membranes|builders? merchant|plumb ?center|plumbase|city plumbing)\b/],
  ['tools', /\b(screwfix|toolstation|machine mart|protimeter|tramex|flir|axminster|ffx|its tools|toolstop)\b/],
  ['vehicle', /\b(kwik ?fit|halfords|dvla|mot centre|mot test|tyres?|autoglass|car wash|motor|garage services)\b/],
  ['insurance', /\b(insurance|insure|hiscox|simply business|axa|aviva|direct line|admiral|zurich|markel|policy)\b/],
  ['phone', /\b(o2|vodafone|giffgaff|virgin media|talktalk|plusnet|smarty|lebara|ee ltd|three\.co\.uk|hutchison|bt group|sky uk)\b/],
  ['software', /\b(google|microsoft|apple\.com|vercel|neon|github|adobe|canva|dropbox|notion|xero|quickbooks|freeagent|zoom|calendly|resend|ionos|godaddy|namecheap|123-?reg|cloudflare|openai|anthropic|survey ?mate|icloud)\b/],
  ['professional', /\b(accountan|bookkeep|solicitor|companies house|legal|chartered)\b/],
  ['fees', /\b(revolut fee|monthly plan|plan fee|card delivery|fx fee|subscription fee)\b/]
];

/* Merchant category codes Revolut Business includes on card payments. */
const MCC = {
  5541: 'fuel', 5542: 'fuel', 5983: 'fuel',
  7523: 'travel', 4111: 'travel', 4121: 'travel', 4784: 'travel',
  5211: 'materials', 5200: 'materials', 5251: 'materials', 5039: 'materials', 5074: 'materials',
  5072: 'tools', 5045: 'software', 5734: 'software',
  7538: 'vehicle', 7542: 'vehicle', 5533: 'vehicle',
  6300: 'insurance', 4814: 'phone', 4899: 'phone', 8931: 'professional', 8111: 'professional',
  7311: 'advertising'
};

/* The damp partners' names and the longer forms they are paid under. Any
   other set of books passes its own people's first names, which are matched
   as written. */
const PARTNER_NAMES = { scott: ['scott'], tom: ['tom', 'thomas'], ben: ['ben', 'benjamin'] };

const aliases = (name) => PARTNER_NAMES[name] || [name.replace(/[^a-z]/g, '')];

/** The one partner named on the line, or null if none or more than one. */
export function partnerNamed(text, people = PEOPLE) {
  const hay = ` ${String(text || '').toLowerCase()} `;
  const found = people.filter((p) => aliases(p).some((n) => n && new RegExp(`\\b${n}\\b`).test(hay)));
  return found.length === 1 ? found[0] : null;
}

const haystack = (tx) => [tx.description, tx.reference, tx.counterparty].filter(Boolean).join(' ').toLowerCase();

/**
 * {category, split} for a freshly imported line. split is [] unless the line
 * itself says whose money it is. `people` are the first names a partner on
 * these books goes by; the split names one of them and the caller maps it to
 * whatever key those books use.
 */
export function autoTag(tx, people = PEOPLE) {
  const type = String(tx.type || '').toUpperCase();
  const hay = haystack(tx);
  const out = tx.amountPence < 0;
  const partner = partnerNamed(hay, people);

  if (!out) {
    if (/REFUND/.test(type)) return { category: 'refund', split: [] };
    /* A top-up is Revolut's own word for money the account holder put in from
       elsewhere, so a partner's name on one is theirs. A plain transfer in
       from "Tom" is not assumed to be Tom's: it is far more often a customer
       who happens to share the name, and it waits for a person or a learned
       rule. */
    if (/^(TOPUP|TOP_UP)$/.test(type)) return { category: 'capital', split: partner ? [partner] : [] };
    return { category: 'income', split: [] };
  }

  if (type === 'FEE') return { category: 'fees', split: [] };
  if (type === 'ATM' || /\batm\b|cash withdrawal/.test(hay)) return { category: 'cash', split: [] };
  if (type === 'EXCHANGE' || /\b(vault|pocket|savings)\b/.test(hay)) return { category: 'transfer', split: [] };
  for (const [category, pattern] of MERCHANTS) {
    if (pattern.test(hay)) return { category, split: category === 'tax' ? ['tax'] : [] };
  }
  /* Money sent out to a partner by name is their drawings. Only a transfer
     counts: a card payment to a shop with Ben in its name is a shop. */
  const transfer = type === 'TRANSFER' || /\btransfer\b/.test(hay);
  if (partner && transfer && !/\brefund\b/.test(hay)) return { category: 'drawings', split: [partner] };
  const byCode = MCC[Number(tx.mcc)];
  if (byCode) return { category: byCode, split: [] };
  return { category: 'other', split: [] };
}

/**
 * The description with its numbers taken out, which is what stays the same
 * between one visit to a garage and the next: "Card payment to BP MAIDSTONE
 * 1234, 12 Aug" and "... 5678, 3 Sep" share a key.
 */
export function ruleKey(tx) {
  const text = [tx.counterparty, tx.description].filter(Boolean).join(' ');
  return text.toLowerCase()
    .replace(/[0-9]+/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}
