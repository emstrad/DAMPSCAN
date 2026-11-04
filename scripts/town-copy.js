/**
 * The shared framing on a DampScan town survey page, in three versions per
 * section. The local copy in content/kent-towns/ is what each page is for;
 * this is the part every survey has in common, written three ways so that no
 * two towns carry the same words (see scripts/variants.js), and with the
 * town's own name, walling and water written into it where they belong.
 *
 * DampScan's voice, not ATi's: Kent houses, a surveyor who drives to you,
 * plain words. Survey and report only, no treatment sold.
 *
 * Each function takes the town object and returns HTML.
 */

const covers = [
  (t) => ({
    h: `What a DampScan survey in ${t.name} covers`,
    lead: `A survey here is a morning or an afternoon with one qualified surveyor, not a salesman with a meter. In ${t.name} that means:`,
    list: [
      `Moisture readings across a grid on every affected wall, not just the stain, so the shape of the damp is on record`,
      `A look at ${t.material} or brick outside, joint by joint where it matters, because the cause is usually on the outside face`,
      `Ground and path levels against each elevation, measured against the damp proof course or the internal floor`,
      `Gutters, downpipes, gullies and any drain covers we can lift`,
      `Air temperature, humidity and surface temperatures, so condensation is measured rather than guessed`,
      `Ventilation: whether fans extract to outside and how much air they actually move`,
      `Floor voids and exposed timbers where they can be reached, for rot and beetle`
    ]
  }),
  (t) => ({
    h: `Inside and out: the ${t.name} survey, step by step`,
    lead: `Most damp is decided outside the house, so that is where half the visit goes. On a typical ${t.name} property we check:`,
    list: [
      `The outside walls first: pointing, render, sills, and how ${t.material} has been repaired over the years`,
      `Where the ground sits against the wall, front and back, and whether a patio or flower bed has crept up`,
      `Rainwater: gutters, hoppers, downpipes and where they discharge, ideally after we have seen them in rain`,
      `Damp readings inside on a pattern, with a reference reading from a dry wall for comparison`,
      `Salts, tide marks and blown plaster, which say what the water has been doing for years`,
      `Room conditions: humidity, dew point and the coldest surfaces, for any mould`,
      `Timber in reach: skirtings, joist ends, sub floor and the loft hatch view of the roof`
    ]
  }),
  (t) => ({
    h: `What we check on a damp survey in ${t.name}`,
    lead: `The visit follows the water. Whatever brought you to us, in ${t.name} we work through:`,
    list: [
      `The roofline and chimney from the ground and from windows, then gutters and downpipes in detail`,
      `Every outside wall for cracks, open joints, failed render and anything bridging the base of the wall`,
      `Airbricks and sub floor ventilation, often buried by later paths and extensions`,
      `Internal walls with calibrated readings at height bands, so rising, penetrating and condensation damp can be told apart`,
      `Surface and air conditions in the problem rooms, logged rather than estimated`,
      `Kitchen and bathroom extraction, measured at the grille`,
      `Any earlier damp proofing, its paperwork and whether it was ever the right answer`
    ]
  })
];

const report = [
  (t) => ({
    h: 'What the written report contains',
    lead: `Your report arrives the day after the visit. A typical one for a ${t.name} house sets out:`,
    list: [
      'A plain English summary on the first page: what is wrong, why, and how urgent it is',
      'Photographs of each defect, with where it is on the building',
      'The moisture readings, mapped, with what they mean',
      'The cause of each damp area, and the faults ruled out and why',
      'What should be done, in priority order, written so any contractor can price it',
      'What does not need doing, stated as clearly as what does'
    ]
  }),
  (t) => ({
    h: `A sample report, in outline`,
    lead: `No two reports are the same, but a ${t.name} report usually runs in this order:`,
    list: [
      'Property and conditions on the day, including recent weather',
      'Findings by room and by elevation, each with photographs',
      'Readings and the pattern they make, not a single headline figure',
      'Diagnosis: the cause, and the alternatives that were tested and excluded',
      'Recommendations as a specification, with the order to do them in',
      'Anything not inspected, and exactly where to look if it needs opening up'
    ]
  }),
  (t) => ({
    h: 'The report, and what you can do with it',
    lead: `You get it in writing the next day. It is built so you can use it, whether you are living in ${t.name}, letting there or buying there:`,
    list: [
      'Hand it to two or three contractors and compare prices for the same job',
      'Put it to a seller or agent during a purchase, with the evidence attached',
      'Give it to a landlord, managing agent or freeholder as an independent record',
      'Check a damp proofing quote you already hold against what was actually found',
      'Keep it with the deeds, so the next survey starts from facts',
      'Ask us questions about it afterwards, at no extra charge'
    ]
  })
];

const process = [
  (t) => ({
    h: 'How it works',
    steps: [
      `You send the form or call. We reply the same day and confirm the fee in writing.`,
      `A qualified surveyor comes to your ${t.name} address at a time that suits you, including evenings and weekends.`,
      `The survey takes one to two hours for most homes, longer for large or period buildings.`,
      `Your written report follows the next day, and we are on the phone if anything in it needs explaining.`
    ]
  }),
  (t) => ({
    h: `Booking a survey in ${t.name}`,
    steps: [
      `Tell us the postcode and what you have noticed. Photos help but are not needed.`,
      `We agree a fixed fee and a slot. Nothing changes once agreed, whatever we find.`,
      `On the day we inspect outside first, then inside, and talk you through what we see before we leave.`,
      `The report lands in your inbox the next day, ready to share.`
    ]
  }),
  (t) => ({
    h: 'From enquiry to report',
    steps: [
      `Same day reply to every ${t.name} enquiry, with the fee confirmed before we book.`,
      `One surveyor, on site for as long as the house needs, not a fixed slot.`,
      `Findings explained on the doorstep in plain words.`,
      `A written report with photographs and readings the day after the visit.`
    ]
  })
];

const independent = [
  (t) => `We are survey only. DampScan does not inject damp proof courses, tank walls, spray timbers or fit fans, so nothing in a ${t.name} report is there to create work for us. If you are holding a damp proofing quote, read <a href="/damp-proofing/${t.slug}">damp proofing in ${t.name}: survey first</a> before you sign it.`,
  (t) => `Most damp firms in Kent survey for free and earn their money on the treatment. We charge for the survey and sell no treatment at all, which is the whole point: finding nothing wrong with a ${t.name} wall costs us nothing. There is more on that on our page about <a href="/damp-proofing/${t.slug}">damp proofing in ${t.name}</a>.`,
  (t) => `Independent means we have no product behind the report. We do not install damp proofing, waterproofing or ventilation, and we take no commission from anyone who does. That is why a ${t.name} report from us can say "no treatment needed" without anybody losing a sale. See <a href="/damp-proofing/${t.slug}">damp proofing in ${t.name}</a> if you have already been quoted.`
];

const tellApart = [
  (t) => ({
    h: 'Rising damp, penetrating damp or condensation?',
    paras: [
      `They can look the same on a ${t.name} wall: a stain, a tide mark, blown plaster or mould. They behave differently. Rising damp is steady through the year and highest at the base of a wall. Penetrating damp follows the weather and sits where water has a route in, around a window, under a gutter, on the exposed side. Condensation is worst in cold weather, on the coldest surfaces, and often comes with streaming windows.`,
      'A meter alone cannot tell them apart, and salts in old plaster make every damp meter read high. The pattern, the readings at depth, the outside of the building and the room conditions together can, which is why the survey takes the time it does.'
    ]
  }),
  (t) => ({
    h: 'Telling the kinds of damp apart',
    paras: [
      `Most of the cost of a damp problem comes from treating the wrong one. Water rising from the ground, rain getting in from outside and moisture condensing from the air inside all leave marks on a ${t.name} wall, and the marks overlap.`,
      'The differences are in when and where. Damp that comes and goes with rain points outside. Damp that is worst in a cold snap, behind furniture and in corners, points to condensation. Damp that is constant, rises to a fairly even height and falls off above it, on a wall with no outside fault, is the one that might be rising. The survey records which of these the evidence supports.'
    ]
  }),
  (t) => ({
    h: 'Three kinds of damp, three different fixes',
    paras: [
      `Rising damp needs the ground moisture stopped at the base of the wall. Penetrating damp needs the route in closed: a gutter, a joint, a sill, a flashing. Condensation needs less moisture in the air, more air movement and warmer surfaces. In ${t.name}, as everywhere, these get confused constantly, and a remedy for one does nothing for the others.`,
      'That is the case for an independent survey in a sentence. Somebody needs to work out which problem you have before anybody sells you the fix for one of them.'
    ]
  })
];

const landlords = [
  (t) => `Letting in ${t.name}? Damp and mould in rented homes are a hazard under the Housing Health and Safety Rating System, and social landlords in England now have fixed timescales to investigate and act under Awaab's Law, with the government planning to extend similar duties to private renting. An independent report that separates building defects from condensation is the evidence both landlords and tenants need. See our <a href="/guides/landlord-damp-and-mould-duties">guide to landlord damp and mould duties</a>.`,
  (t) => `We survey for landlords, letting agents and tenants across ${t.name}. A report that measures the cause, rather than blaming lifestyle or the building by default, settles most disputes about mould. With Awaab's Law already applying to social housing in England and the same principles being extended to private lets, landlords are well advised to have damp investigated properly and promptly. Our <a href="/guides/landlord-damp-and-mould-duties">landlord guide</a> sets out the duties in plain terms.`,
  (t) => `For ${t.name} landlords, damp and mould is now a legal risk as much as a maintenance one. Social landlords in England must investigate and fix serious damp and mould within set timescales under Awaab's Law, and private landlords already owe duties under the Housing Act 2004 and the fitness for habitation rules, with further reform on the way. A written survey gives you a record of cause and action. More in our <a href="/guides/landlord-damp-and-mould-duties">guide for landlords</a>.`
];

const cta = [
  (t) => `Same day reply to every enquiry, a fixed fee agreed before we come, and a written report the day after the visit to your ${t.name} home.`,
  (t) => `Tell us your postcode and what you have noticed. We confirm the fee the same day and arrange a visit around you, anywhere in and around ${t.name}.`,
  (t) => `One qualified surveyor, nothing to sell, and the report in writing within a day. Book online or call, and we will confirm cover for your ${t.name} postcode straight away.`
];

export const SURVEY_COPY = { covers, report, process, independent, cta, tellApart, landlords };
/* How many sections take a variant: covers, report, process, independent,
   cta, tellApart, landlords. */
export const SURVEY_SECTIONS = 7;
