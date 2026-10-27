/* What a damp survey costs in Kent, dampscan. The figures are the ones on the
   prices page (content/pricing.js), so the two cannot disagree. No price goes
   in the title or description: the owners asked for none in search results. */
import { pricing } from '../pricing.js';

const band = (key) => pricing.dampscan.bands.find((b) => b.key === key).price;

export default {
  slug: 'damp-survey-cost-kent',
  site: 'dampscan',
  name: 'How much does a damp survey cost in Kent?',
  title: 'How Much Does a Damp Survey Cost in Kent? | DampScan',
  metaDescription:
    'What decides the cost of a damp survey in Kent, why some are free and others are not, and what you should get for the fee. Plain answers before you book.',
  h1: 'How much does a damp survey cost in Kent?',
  published: '2026-10-15',
  intro:
    'Damp surveys in Kent range from free to several hundred pounds, and the price tells you more about who is doing the survey than about the survey itself. This guide explains what drives the cost, what a fair fee covers, and why a free survey is rarely free. Our own fees are published, fixed before we visit, and set out below.',
  sections: [
    {
      h2: 'Free surveys and paid surveys are different things',
      paras: [
        'A free damp survey is almost always carried out by a firm that sells damp proofing, and its cost is recovered from the treatment it recommends. That does not make every free survey wrong, but it gives the person holding the meter a reason to find something, and it means the "survey" is often a short visit ending in a quote.',
        'A paid survey from an independent surveyor is the whole transaction. The fee pays for the time on site, the readings, the diagnosis and the written report, and the surveyor gains nothing from recommending work. DampScan works this way: we carry out no remedial work, so finding nothing wrong costs us nothing.'
      ]
    },
    {
      h2: 'What decides the cost',
      paras: [
        'The size of the property and how much of it needs inspecting matter most. A single damp patch in one room is a shorter job than a whole house before a purchase. Construction matters too: a Victorian terrace, a ragstone cottage, a converted oast or a basement each take longer to understand than a modern semi.'
      ],
      list: [
        'How many rooms and elevations need inspecting',
        'Whether the property is period, listed or heavily extended',
        'Whether there are cellars, basements or sub floors to look at',
        'Whether timber decay or woodworm needs assessing as well as damp',
        'Whether anything needs opening up, which should always be agreed first'
      ]
    },
    {
      h2: 'Our fees',
      paras: [
        `A localised survey of one or two rooms is ${band('localised')}. A full survey of a house of up to three bedrooms is ${band('full-house')}. Larger houses of four or five bedrooms start at ${band('large-property')}, and very large, listed or heavily extended properties start at ${band('premium')}. The fee is confirmed in writing before we come and does not change afterwards, whatever we find. There is nothing added for travel anywhere we cover in Kent.`,
        'The only optional extra is an invasive check, such as lifting a board or cutting a small inspection hole, and that is only ever done with your agreement on the day. Every band and what it includes is on our <a href="/pricing">prices page</a>.'
      ]
    },
    {
      h2: 'What you should get for the fee',
      paras: [
        'Whoever you use, a damp survey worth paying for includes time outside as well as inside, readings taken across the wall rather than at one spot, a diagnosis that explains why the alternatives were ruled out, and a written report with photographs. It should also tell you clearly what does not need doing.'
      ],
      list: [
        'An external inspection of ground levels, gutters, downpipes, pointing and render',
        'Moisture readings mapped across each affected wall, not just a headline figure',
        'Humidity and surface temperature readings where condensation is possible',
        'A written report with photographs within a day or two of the visit',
        'A specification any contractor could price, if work is needed'
      ]
    },
    {
      h2: 'When a survey pays for itself',
      paras: [
        'The most common outcome of an independent survey is that the work someone has quoted for is either not needed or needs to be much smaller. A raised path dug down, a gutter repaired, a fan ducted to outside, or a wall repointed in lime often replaces a quote for injection and replastering several times the survey fee.',
        'For buyers, the survey can also be used to negotiate. A report that shows a defect and its proportionate repair is a far stronger basis for a price reduction than a vague comment in a homebuyer report.'
      ]
    }
  ],
  faq: [
    { q: 'Why not just use a free survey?', a: 'You can, but treat it as a quote rather than a diagnosis. If the free survey recommends significant work, an independent survey before you sign is the cheapest way to check it.' },
    { q: 'Is the survey fee the same across Kent?', a: 'Yes. Our fee depends on the property, not the postcode, and nothing is added for travel anywhere we cover.' },
    { q: 'Do you charge extra for evenings or weekends?', a: 'No. Visits are arranged around you at the same fee.' },
    { q: 'What if you find nothing wrong?', a: 'The fee is the same, and the report says so with the readings to support it. For many people that is the most valuable result.' },
    { q: 'Can I get a survey for one room only?', a: 'Yes. The localised survey covers one or two rooms. If the cause turns out to be elsewhere, we tell you on site what a wider survey would cost rather than widening it without asking.' },
    { q: 'Does the fee include woodworm and rot?', a: 'Accessible timbers are checked as part of the survey. A full timber survey of a large or period house is reflected in the band we quote before we come.' }
  ],
  related: ['damp-surveys', 'damp-proofing', 'rising-damp']
};
