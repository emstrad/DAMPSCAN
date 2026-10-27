/**
 * Published survey prices, per site.
 *
 * Both practices are survey only and carry out no remedial work, so for both
 * the survey is the entire transaction and the fee is simply the price of the
 * thing being sold. The two pages are still two sets of words, because they
 * serve different places (London, and Kent and the South East) and must not
 * read as copies of each other.
 *
 * Both pages state that the figure shown is the figure paid, without going into
 * why. If either practice's tax position ever changes so that something does
 * get added to these prices, that line has to change on the same day, because a
 * price that quietly stops being the total is the sort of thing these pages
 * exist to argue against.
 */
import { SIZES, pounds } from './prices.js';

/* The figures come from the one price list (content/prices.js). */
const at = (key) => SIZES.find((x) => x.key === key);
const bandPrice = (key) => pounds(at(key).damp, at(key).from);
const timberPrice = (key) => pounds(at(key).damp + at(key).timber, at(key).from);

const ati = {
  site: 'ati',
  slug: 'pricing',
  title: 'Damp Survey Prices in London | ATi Damp Survey',
  metaDescription:
    'What an independent damp survey costs in London: four fixed price bands, what each includes, and what is never added afterwards. Report in 24 hours.',
  h1: 'What a survey costs, and what decides it',
  intro:
    'Most damp surveys in London are free, and that is the problem with them. A free survey is paid for by the work it recommends, which is why so many of them recommend work. We sell no remedial work at all, so the survey is the whole transaction and the price can simply be published.',

  /* Two separate claims, and neither is allowed to overreach. The old wording
     said nothing is ever added and then listed an add on, which is the kind of
     thing this practice exists to stop other people doing. */
  priceLead: 'The price you see is the price you pay.',
  fixedFee: 'The survey fee is agreed in writing before we attend and does not change afterwards, whatever we find. Extras such as a timber assessment or an invasive check are priced below, and nothing is added unless you agree to it first.',

  bands: [
    {
      key: 'localised',
      name: 'Localised damp survey',
      price: bandPrice('localised'), timber: timberPrice('localised'),
      fixed: true,
      scope: 'One or two rooms',
      best: 'A specific problem in a specific place: one damp wall, one stained ceiling, one room with mould.',
      note: 'The rest of the property is not inspected, so if the cause turns out to sit elsewhere we will say so and tell you what a wider look would cost. We do not simply widen the survey and bill you for it.'
    },
    {
      key: 'full-house',
      name: 'Full house survey',
      price: bandPrice('full-house'), timber: timberPrice('full-house'),
      fixed: true,
      scope: 'Up to three bedrooms',
      best: 'Most flats and terraces. A whole property inspected inside and out, whether or not you have spotted a problem in every room.',
      note: 'This is the right choice before a purchase, for a landlord facing a complaint, or when damp has appeared in more than one place and you do not yet know whether they are related.'
    },
    {
      key: 'large-property',
      name: 'Large property survey',
      price: bandPrice('large-property'), timber: timberPrice('large-property'),
      fixed: false,
      scope: 'Four to five bedrooms',
      best: 'Larger houses, which take longer to inspect properly rather than being harder.',
      note: 'The figure moves with the size of the building and how much of it is accessible. We confirm the exact fee in writing before we attend, and it does not move afterwards.'
    },
    {
      key: 'premium',
      name: 'Very large or period property',
      price: bandPrice('premium'), timber: timberPrice('premium'),
      fixed: false,
      scope: 'Six or more bedrooms, or period',
      best: 'Buildings where the construction itself is the complication: multiple build eras, cellars, lightwells, extensions meeting original fabric.',
      note: 'Quoted individually after we know what the building is. Ask and we will give you a figure, not a range, before you commit to anything.'
    }
  ],

  /* Printed inside every band card, identical in each, because it applies to
     every band and a reader comparing two cards should not have to notice that
     only one of them mentions it. */
  invasiveLine: 'Invasive checks, if needed: from £85 on the same visit. If something can only be settled by opening up, we carry the tools for it: a small incision in plaster, a length of skirting off, a floorboard lifted. Agreed with you before we start, never after.',

  included: [
    'A qualified surveyor on site for as long as the property takes, not a fixed appointment slot',
    'Calibrated moisture readings taken to depth, not surface readings from a pin meter',
    'Surface temperature and humidity readings where condensation has to be excluded rather than assumed',
    'External inspection: ground levels, drainage, gutters, pointing, roof junctions and anything else feeding water into the building',
    'A written report within 24 hours of the visit, with photographs and the readings behind every conclusion',
    'A clear statement of what does not need doing, and where a quote you are holding goes beyond the defect',
    'A specification detailed enough for you to obtain competitive quotes, which we will never bid for'
  ],

  notIncluded: [
    {
      h: 'Nothing is added for travel',
      p: 'Anywhere in Greater London, the agreed fee is the fee. Congestion Charge, ULEZ and parking are our problem, not a line on your invoice. Outside the M25 we quote individually or refer you on.'
    },
    {
      h: 'Evenings and weekends cost no more',
      p: 'We work around tenants and working days as a matter of course. There is no out of hours premium.'
    },
    {
      h: 'A second visit, if you need one',
      p: 'If you need us back after works to verify what was done, that is a shorter visit and priced accordingly. It is never assumed or added automatically.'
    }
  ],

  faq: [
    {
      q: 'Why would I pay when other firms survey for free?',
      a: 'Because a free survey is not free, it is a sales visit, and the cost of it sits inside the work that gets recommended afterwards. That arrangement is fine when the diagnosis is obvious and the work is genuinely needed. It stops being fine the moment the honest answer is that little or nothing needs doing, because nobody in that arrangement gets paid for saying so. We carry out no remedial work of any kind, so there is no version of the conclusion that earns us more. The fee is what pays for the opinion.'
    },
    {
      q: 'I have damp in one room of a four bedroom house. Which band?',
      a: 'Start with the localised survey at £215. If the cause is where the damp is, that is the whole job and you have paid the smallest fee that answers the question. If the readings point somewhere else in the building, we will tell you on site what a full survey would cost and you can decide there and then. We would rather sell you the £215 twice than the £375 once for no reason.'
    },
    {
      q: 'What if you find nothing wrong?',
      a: 'The fee is the same, and the report is arguably worth more. Establishing that a property does not have a damp problem is a real finding, and it is the one that saves people the most money, whether that is a purchase that proceeds or a quote that gets refused. You are paying for the inspection and the written conclusion, not for a list of defects.'
    },
    {
      q: 'Can the price change after you arrive?',
      a: 'The survey fee cannot, including if the property turns out to be larger or more awkward than described. The only way your total ends up higher than the band price is if you agree on the day to an invasive inspection, which starts at £85 for the visit. We will only suggest it where opening up would actually change the conclusion, and if it would not we will tell you that instead.'
    }
  ]
};

const dampscan = {
  site: 'dampscan',
  slug: 'pricing',
  title: 'Damp Survey Prices in Kent and the South East | DampScan',
  metaDescription:
    'What a damp survey costs across Kent and the South East: four fixed price bands, what each includes, and what is never added afterwards.',
  h1: 'What a survey costs, and what decides it',

  /* The point of paying for a survey in Kent, where most damp firms offer a
     free one: we sell no treatment, so the fee is the whole of our interest. */
  intro:
    'Plenty of Kent damp firms will survey for nothing, and then quote for the treatment. We do it the other way: you pay a published fee for the survey and the written report, and we carry out no remedial work, so there is nothing to sell you afterwards. The report tells you what does not need doing as plainly as what does.',

  priceLead: 'The price you see is the price you pay.',
  fixedFee: 'The survey fee is agreed in writing before we attend and does not change afterwards, whatever we find. Extras such as a timber assessment or an invasive check are priced below, and nothing is added unless you agree to it first.',

  bands: [
    {
      key: 'localised',
      name: 'Localised damp survey',
      price: bandPrice('localised'), timber: timberPrice('localised'),
      fixed: true,
      scope: 'One or two rooms',
      best: 'A specific problem in a specific place: one damp wall, one stained ceiling, one room with mould.',
      note: 'The rest of the property is not inspected, so if the cause turns out to sit elsewhere we will say so and tell you what a wider look would cost. We do not simply widen the survey and bill you for it.'
    },
    {
      key: 'full-house',
      name: 'Full house survey',
      price: bandPrice('full-house'), timber: timberPrice('full-house'),
      fixed: true,
      scope: 'Up to three bedrooms',
      best: 'Most semis and terraces. A whole property inspected inside and out, whether or not you have spotted a problem in every room.',
      note: 'This is the right choice before a purchase, for a landlord facing a complaint, or when damp has appeared in more than one place and you do not yet know whether they are related.'
    },
    {
      key: 'large-property',
      name: 'Large property survey',
      price: bandPrice('large-property'), timber: timberPrice('large-property'),
      fixed: false,
      scope: 'Four to five bedrooms',
      best: 'Larger houses, which take longer to inspect properly rather than being harder.',
      note: 'The figure moves with the size of the building and how much of it is accessible. We confirm the exact fee in writing before we attend, and it does not move afterwards.'
    },
    {
      key: 'premium',
      name: 'Very large or period property',
      price: bandPrice('premium'), timber: timberPrice('premium'),
      fixed: false,
      scope: 'Six or more bedrooms, or period',
      best: 'Buildings where the construction itself is the complication: multiple build eras, cellars, outbuildings, extensions meeting original fabric.',
      note: 'Quoted individually after we know what the building is. Ask and we will give you a figure, not a range, before you commit to anything.'
    }
  ],

  invasiveLine: 'Invasive checks, if needed: from £85 on the same visit. If something can only be settled by opening up, we carry the tools for it: a small incision in plaster, a length of skirting off, a floorboard lifted. Agreed with you before we start, never after.',

  included: [
    'A qualified surveyor on site for as long as the property takes, not a fixed appointment slot',
    'Calibrated moisture readings taken to depth, not surface readings from a pin meter',
    'Surface temperature and humidity readings where condensation has to be excluded rather than assumed',
    'External inspection: ground levels, drainage, gutters, pointing, roof junctions and anything else feeding water into the building',
    'A written report within 24 hours of the visit, with photographs and the readings behind every conclusion',
    'A clear statement of what does not need doing, and where a quote you are holding goes beyond the defect',
    'A specification detailed enough for contractors to price like for like. We never bid for the work ourselves'
  ],

  notIncluded: [
    {
      h: 'Nothing is added for travel',
      p: 'Anywhere across our Kent and South East coverage, the agreed fee is the fee. Fuel, tolls and parking are our problem, not a line on your invoice. Properties inside London are surveyed by our sister practice, ATi Damp Survey, and priced the same way.'
    },
    {
      h: 'Evenings and weekends cost no more',
      p: 'We work around tenants and working days as a matter of course. There is no out of hours premium.'
    },
    {
      h: 'A second visit, if you need one',
      p: 'If you need us back after works to verify what was done, that is a shorter visit and priced accordingly. It is never assumed or added automatically.'
    }
  ],

  faq: [
    {
      q: 'Other Kent firms survey for free. Why pay you?',
      a: 'Because a free survey is usually paid for by the treatment it recommends. We carry out no remedial work at all, so finding something earns us nothing, and finding nothing costs us nothing. Every conclusion in the report is shown with the readings and photographs it rests on, it says plainly what does not need doing, and where a quote you already hold goes further than the defect it says that too.'
    },
    {
      q: 'I have damp in one room of a four bedroom house. Which band?',
      a: 'Start with the localised survey at £215. If the cause is where the damp is, that is the whole job and you have paid the smallest fee that answers the question. If the readings point somewhere else in the building, we will tell you on site what a full survey would cost and you can decide there and then. We would rather sell you the £215 twice than the £375 once for no reason.'
    },
    {
      q: 'What if you find nothing wrong?',
      a: 'The fee is the same, and the report is arguably worth more. Establishing that a property does not have a damp problem is a real finding, and it is the one that saves people the most money, whether that is a purchase that proceeds or a quote that gets refused. You are paying for the inspection and the written conclusion, not for a list of defects.'
    },
    {
      q: 'Can the price change after you arrive?',
      a: 'The survey fee cannot, including if the property turns out to be larger or more awkward than described. The only way your total ends up higher than the band price is if you agree on the day to an invasive inspection, which starts at £85 for the visit. We will only suggest it where opening up would actually change the conclusion, and if it would not we will tell you that instead.'
    }
  ]
};

export const pricing = { ati, dampscan };
