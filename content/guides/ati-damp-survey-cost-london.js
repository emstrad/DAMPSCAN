/* What a damp survey costs in London, ati. Figures come from content/pricing.js
   so the guide and the prices page cannot disagree. No price in the title or
   description. DampScan's Kent guide is a separate document. */
import { pricing } from '../pricing.js';

const band = (key) => pricing.ati.bands.find((b) => b.key === key).price;

export default {
  slug: 'damp-survey-cost-london',
  site: 'ati',
  name: 'What does a damp survey cost in London?',
  title: 'What Does a Damp Survey Cost in London? | ATi Damp Survey',
  metaDescription:
    'What drives the cost of an independent damp survey in London, how flats, basements and listed buildings change it, and what the fee should buy you.',
  h1: 'What does a damp survey cost in London?',
  published: '2026-10-15',
  intro:
    'In London the price of a damp survey depends less on the number of bedrooms than on the building: a lower ground flat in a converted terrace, a mansion block, a basement with a pump, a listed house in a conservation area. This guide explains what moves the fee, what a London survey should include, and why an independent fee is usually cheaper than a free survey once the work it recommends is counted.',
  sections: [
    {
      h2: 'Why London surveys differ',
      paras: [
        'Most London homes are flats or terraces that share structure with their neighbours. A damp patch in one flat may come from a roof, a parapet, a soil stack or a front area that belongs to the building. Establishing that takes longer than inspecting a detached house, and the report has to say who is likely to be responsible as well as what is wrong.',
        'Basements are the other London factor. Many are engineered spaces with membranes, channels and pumps, and inspecting one properly means looking at the system as well as the walls.'
      ]
    },
    {
      h2: 'Our fees',
      paras: [
        `A localised survey of one or two rooms is ${band('localised')}. A full survey of a flat or house of up to three bedrooms is ${band('full-house')}. Larger homes of four or five bedrooms start at ${band('large-property')}, and very large, heavily extended or listed buildings start at ${band('premium')}. The fee is agreed in writing before we attend and does not change afterwards. Congestion Charge, ULEZ and parking are not added.`,
        'The only optional extra is an invasive check, agreed with you on the day. Full details are on our <a href="/pricing">prices page</a>.'
      ]
    },
    {
      h2: 'What should be included',
      list: [
        'Inspection of the parts of the building that affect your flat: roof, parapets, gutters, front area, lightwells and shared drains where they can be seen',
        'Moisture readings across and up each affected wall, at depth as well as the surface',
        'Humidity and surface temperature readings where mould or condensation is involved',
        'For basements, the drainage system: channels, sump, pumps and alarms',
        'A written report within 24 hours, with photographs, the cause and who is likely responsible',
        'A specification for contractors to price, and an indication of what that work should cost'
      ],
      paras: [
        'A survey that only looks inside the flat, or only reports a meter reading, is not worth the fee whatever it costs.'
      ]
    },
    {
      h2: 'Free survey or independent survey?',
      paras: [
        'Free surveys are paid for by the treatment they recommend. ATi carries out no remedial work, so the fee is the whole of our interest and finding nothing wrong costs us nothing. In London, where replastering and making good in a period flat is expensive and disruptive, an independent opinion before work starts usually saves more than it costs.'
      ]
    }
  ],
  faq: [
    { q: 'Do you charge more in central London?', a: 'No. The fee depends on the property, not the postcode, anywhere in Greater London.' },
    { q: 'Do I pay extra if access to communal areas is needed?', a: 'No. We arrange access with you, and the fee stays as agreed.' },
    { q: 'Is a basement survey more expensive?', a: 'It falls within the band for the property. Very large or complex basements may move a property into a higher band, which we confirm before we come.' },
    { q: 'Can a leaseholder recover the cost from the freeholder?', a: 'That depends on the lease and the outcome. A report showing that the cause lies in the freeholder\'s part of the building is often the basis for that conversation.' },
    { q: 'Do you survey for solicitors and managing agents?', a: 'Yes, regularly, and the report is written to be read by them.' },
    { q: 'What if nothing is wrong?', a: 'The fee is the same and the report says so, with the readings to support it.' }
  ],
  related: ['damp-surveys', 'basement-waterproofing', 'damp-proofing']
};
