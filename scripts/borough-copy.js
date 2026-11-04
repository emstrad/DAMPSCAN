/**
 * Framing sections on ATi's London borough pages, in three versions each,
 * picked per borough by scripts/variants.js so no two borough pages carry the
 * same framing. ATi's voice: London buildings, flats and leases, purchases,
 * freeholders and disrepair, a practice that does no remedial work. The
 * DampScan town pages have their own copy (scripts/town-copy.js) and never
 * share a sentence with this.
 *
 * Each function takes the area object and returns HTML.
 */

const first = (a) => (a.places && a.places[0]) || a.name;

const covers = [
  (a) => ({
    h: `What an ATi survey in ${a.name} includes`,
    list: [
      `Moisture readings taken on a grid and at height bands, so the report can show which way the water is moving`,
      `The outside of the building, including front areas, lightwells, parapets and rear additions where access allows`,
      `Communal elements that affect your flat: shared gutters, soil stacks, roof outlets and the party walls`,
      `Humidity, air and surface temperatures where mould or condensation is in question`,
      `Extract fans checked for where they discharge and how much air they move`,
      `Timbers within reach, and the sub floor where a hatch or a lifted board allows`
    ]
  }),
  (a) => ({
    h: `How we survey a ${a.name} property`,
    list: [
      `Externally first: the elevations, the ground or paving against them, and every route water has to the wall`,
      `For flats, the parts of the building outside the demise that can be seen or reasonably reached`,
      `Readings that distinguish surface salts from moisture in depth, rather than a single pin meter figure`,
      `Dew point conditions in the affected rooms, logged and compared with the coldest surfaces`,
      `Ventilation measured, not assumed from the presence of a fan`,
      `Previous damp treatments identified, with whether they addressed the cause`
    ]
  }),
  (a) => ({
    h: `The inspection, around ${first(a)} and across ${a.name}`,
    list: [
      `Every wall showing damp, and the walls either side of it for comparison`,
      `Rainwater goods and roof junctions from the ground and from windows, and closer where access is safe`,
      `Basement and lower ground floors for water table, drainage and bridging at the lightwell`,
      `Condensation risk measured with temperature and humidity readings`,
      `Visible timber for decay and beetle, with moisture content recorded`,
      `Anything that would need opening up, identified and agreed with you rather than done unannounced`
    ]
  })
];

const report = [
  (a) => ({
    h: 'The report',
    lead: `Written the day after the visit, and structured for the people who will act on it in ${a.name}: you, your solicitor, a freeholder, a contractor.`,
    list: [
      'A summary of the cause and urgency on the first page',
      'Photographs and readings, located on the building',
      'Who is likely responsible for each defect, where it sits outside your demise',
      'Remedial recommendations as a specification for contractors to price',
      'An indication of what that work should reasonably cost',
      'What does not need doing, including any treatment already quoted'
    ]
  }),
  (a) => ({
    h: 'What you receive',
    lead: `A written report with photographs the next day, in plain English, that stands on its own whoever reads it.`,
    list: [
      'Findings by room and by elevation',
      'Readings and the pattern they form',
      'The diagnosis, and the causes considered and excluded',
      'Recommendations in priority order',
      'Notes for a purchase, a lease or a disrepair matter where relevant',
      `A clear line where a quote you hold for a ${a.name} property goes further than the defect`
    ]
  }),
  (a) => ({
    h: 'Inside the report',
    lead: `Each ${a.name} report follows the same order, so it reads easily to a buyer, a landlord or a court:`,
    list: [
      'Scope and conditions on the day',
      'Observations, with photographs',
      'Measurements, with where each was taken',
      'Conclusions on cause',
      'Recommendations and an outline cost',
      'Limitations: what was not inspected and why'
    ]
  })
];

const process = [
  (a) => ({
    h: 'From request to report',
    steps: [
      `Send the request form or call. We reply the same day with the fee in writing.`,
      `We agree a visit, including evenings and weekends, and arrange access to any communal areas if needed.`,
      `The surveyor spends as long as the ${a.name} property needs.`,
      `The written report follows the next day.`
    ]
  }),
  (a) => ({
    h: 'How a survey is arranged',
    steps: [
      `Tell us the postcode, the property type and what has been noticed.`,
      `We confirm the fee and the time. It does not change on the day.`,
      `On site, outside first, then inside, with findings explained before we leave.`,
      `The report arrives within a day, ready to forward to a solicitor, agent or freeholder.`
    ]
  }),
  (a) => ({
    h: 'What happens when you request a survey',
    steps: [
      `A same day reply, with the fee and our first available times in ${a.name}.`,
      `One surveyor, no sales visit to follow, because there is nothing to sell.`,
      `A visit of one to two hours for most flats and houses.`,
      `A written report with readings and photographs the next day.`
    ]
  })
];

const who = [
  (a) => `Most of our ${a.name} surveys are for one of four people: a buyer whose survey flagged damp, a tenant or landlord with mould, a leaseholder trying to get a freeholder to act, or an owner holding a damp proofing quote. Each needs the same thing, an account of the cause from somebody with no interest in the remedy, and that is all we provide.`,
  (a) => `Buyers, landlords, tenants and leaseholders in ${a.name} use our reports for different reasons, but always because the report has nothing behind it. We carry out no remedial work and take no referral fees, so our conclusion is not shaped by what it would lead to.`,
  (a) => `We do not sell damp proofing, tanking, ventilation units or timber treatment. In ${a.name}, as everywhere in London, that independence is what makes the report useful to a buyer negotiating a price, a tenant raising a disrepair issue, or an owner deciding whether a quote is justified.`
];

const kinds = [
  (a) => ({
    h: 'Which kind of damp is it?',
    paras: [
      `In a London building the same stain can have four or five different causes, and in ${a.name} we regularly find two at once. Water rising from the ground through a wall with no working course. Rain entering through a parapet, a gutter, a cracked render or a window head. Moisture from the air condensing on a cold wall. Water from a pipe, a bath seal or a flat upstairs. Each needs a different repair and, in a shared building, often a different person to pay for it.`,
      'Our readings are taken to separate them: at depth as well as at the surface, at heights up the wall, on either side of the damp, and alongside humidity and surface temperatures. The pattern, not a single number, is what the diagnosis rests on.'
    ]
  }),
  (a) => ({
    h: 'Rising, penetrating, condensation or a leak',
    paras: [
      `A tide mark low on a ${a.name} wall is often called rising damp on sight. It may be. It may equally be a patio laid against the outside, a front area drain that has stopped draining, salts left behind by an old leak, or condensation collecting behind furniture on a cold wall. A pin meter cannot tell these apart, because salts and surface moisture make it read high regardless.`,
      'The survey works through the possibilities in order and records why each was accepted or ruled out, so that whoever reads the report, a solicitor, a freeholder or a contractor, can follow the reasoning.'
    ]
  }),
  (a) => ({
    h: 'Getting the diagnosis right in a London building',
    paras: [
      `London's housing has been altered more than most: basements dug, lofts converted, houses split into flats, gardens raised, chimneys removed. In ${a.name} that means damp is frequently the result of a change made decades ago rather than of the original building, and the remedy is to undo or correct that change.`,
      'We look for those alterations as much as for the damp itself. A floor laid above an old course, a fan ducted into a void, a lightwell filled with decking or a stack capped without ventilation explains more damp than any failed damp proof course.'
    ]
  })
];

const tenure = [
  (a) => `Leaseholders in ${a.name} often discover that the cause of their damp sits in a part of the building they do not own. Our report says where the water is coming from and which element of the building it passes through, which is the evidence a freeholder or managing agent needs under the lease. For landlords, damp and mould are hazards under the Housing Health and Safety Rating System, and social landlords in England now work to the fixed timescales of Awaab's Law. Our <a href="/guides/awaabs-law-damp-and-mould">guide to Awaab's Law</a> explains what that means.`,
  (a) => `Buying in ${a.name}? A homebuyer or building survey that recommends a damp specialist should be followed by somebody with nothing to sell. Our report arrives the day after the visit, in time to negotiate, and it separates what is wrong from what simply needs maintaining. Landlords and tenants use the same report to settle what is a building defect and what is condensation; see our <a href="/guides/awaabs-law-damp-and-mould">note on Awaab's Law and landlord duties</a>.`,
  (a) => `Much of ${a.name} is let or leasehold, and damp disputes turn on two questions: what is causing it, and whose responsibility that cause is. A report from a practice that carries out no remedial work answers both without an interest in the outcome, which is why solicitors, managing agents and tenants' advisers use them. More on landlord duties in our <a href="/guides/awaabs-law-damp-and-mould">Awaab's Law guide</a>.`
];

const cta = [
  (a) => `Independent, survey only, and in writing the next day. Request a survey anywhere in ${a.name}.`,
  (a) => `Same day reply, a fixed fee, and a report with nothing to sell. We cover every ${a.name} postcode.`,
  (a) => `Request an independent damp survey in ${a.name}. We do no remedial work, so the report has no other purpose.`
];

export const BOROUGH_COPY = { covers, report, process, who, cta, kinds, tenure };
/* covers, report, process, who, cta, kinds, tenure */
export const BOROUGH_SECTIONS = 7;
