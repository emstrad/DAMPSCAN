/* Water Damage, dampscan. Written from this site's position, not shared with the
   other. See scripts/service-template.js for why the pair are two documents.

   DampScan carries out the work, so this is the drying and the reinstatement:
   what to do in the first two days, why a room that looks dry usually is not,
   and what putting it back properly involves. ATi's page on the same subject is
   about the insurance argument, which is a different job for a different buyer. */
export default {
  slug: 'water-damage',
  site: 'dampscan',
  name: 'Water Damage',
  title: 'Water Damage Drying & Repair in Kent | DampScan',
  metaDescription:
    'Burst pipes, leaks and flooding across Kent and the South East. Moisture mapped, dried to the core and reinstated, under an insured guarantee.',
  h1: 'Water damage: dried properly, not just dried on the surface',
  intro:
    'The expensive mistake after a leak is almost never the leak. It is redecorating three weeks later over fabric that is still wet inside, because the wall felt dry to the hand and nobody measured it. Six months on the paint blisters, a tide mark comes back, and the job is done twice.',
  signsHeading: 'What we are called out to',
  signs: [
    'Burst or leaking pipework, including under floors and behind boxing',
    'Washing machine, dishwasher and boiler failures that ran unnoticed',
    'Overflowing baths, sinks and blocked wastes',
    'Cold water tanks and pipe runs failing in an unheated loft',
    'Storm ingress through roofs, flashings and blocked gutters',
    'A ceiling that has come down, or one that is bowing and about to',
    'Decoration that has blistered or stained again after an earlier repair',
  ],
  sections: [
    {
      h2: 'The first two days matter more than the next two weeks',
      paras: [
        'Stop the water at the stopcock, and if any of it is near lights, sockets or a consumer unit, turn the electrics off at the board and leave them off until someone competent has looked. A ceiling holding water is heavy and comes down without warning, so stay out from under a bulging one.',
        'Then lift what you can: carpets, underlay, and anything absorbent sitting on the floor. Underlay holds water against the screed for weeks and is rarely worth saving. Open windows if it is warmer outside than in, and leave internal doors open so air can move.',
        'What not to do: do not put the heating on full and shut everything up, which drives moisture into cold surfaces elsewhere in the house and gives you a condensation problem on top of a leak. Do not start replastering. And do not throw anything away before it is photographed, because your insurer will want to see it.',
      ]
    },
    {
      h2: 'Why a wall that feels dry usually is not',
      paras: [
        'A surface dries first and fastest. Plaster, screed, masonry and structural timber hold water much longer, and a hand on the wall or a pin meter pushed into the skim tells you about the outer few millimetres and nothing about what is behind them.',
        'We map the moisture rather than sample it: readings across the affected area and to depth, so the extent is a boundary drawn on evidence rather than a guess at where the stain stops. Where the reading needs to be certain, in a screed or a solid wall being signed off before reinstatement, deep measurement settles it.',
        'Drying to the core takes days to weeks depending on what got wet. Plasterboard and timber studwork come back relatively quickly. A sand and cement screed, a solid brick wall or an insulated floor build up can take considerably longer, and no amount of wishing shortens it. What we can do is target the equipment at what is actually wet, and tell you honestly when it is finished rather than when the hire period ends.',
      ]
    },
    {
      h2: 'What the work involves',
      paras: [
        'A survey first, because the drying regime depends on what got wet and how deep it went. That means finding the source if it is still active, establishing the extent, and identifying anything that has to come out rather than be dried, typically saturated insulation, delaminated plasterboard and blown plaster.',
        'Then controlled drying: dehumidification and air movement sized to the space and the materials, monitored with readings rather than left running and hoped over. We record the readings as we go, so there is a documented drying curve at the end instead of an assurance.',
        'Then reinstatement, once and only once the readings say the fabric is dry. Replastering, timber repairs and redecoration, with any salt contaminated plaster removed rather than sealed over, because sealing over it is what produces the tide mark that comes back. Everything we carry out is covered by an insured workmanship guarantee.',
      ]
    },
    {
      h2: 'Insurance, and being straight about the scope',
      paras: [
        'Most escape of water damage is covered by household buildings insurance, and your insurer will usually want a scope and a price before authorising work. We provide that, with the survey findings, photographs and moisture readings behind it, in a form a loss adjuster can assess.',
        'We do not inflate a scope to fill a claim. If half the room is dry we dry half the room, and the report says which half and why. That is the same principle as the rest of what we do: the diagnosis comes first, the price follows it, and nothing gets recommended because it happens to be profitable.',
        'If a claim has already been declined and you want the decision challenged rather than the work done, that is a different job and a contractor is the wrong person to do it. Our sister practice ATi Damp Survey carries out no remedial work at all and writes those reports, which is why they carry weight with an insurer.',
      ]
    },
  ],
  ctaHeading: 'Get it measured before it gets decorated',
  ctaBody:
    'A survey, a moisture map and a written report within 24 hours of the visit, with a scope you can hand to your insurer. Put your postcode in the form and we will confirm cover and fee the same day.',
  faq: [
    {
      q: 'How long does drying actually take?',
      a:
        'It depends entirely on what got wet. Plasterboard and timber studwork often come back within one to two weeks under proper dehumidification. A sand and cement screed, a solid masonry wall or an insulated floor build up can take several weeks, sometimes longer, because the water has gone deep into a dense material and there is no shortcut. Anyone who quotes you a fixed number of days before seeing the property is guessing. We give you a range after the survey and readings as we go, so you can see it happening rather than take our word for it.'
    },
    {
      q: 'Can I just redecorate and see what happens?',
      a:
        'You can, and it is the single most common reason we get called to the same room twice. Fresh plaster and paint over fabric that is still wet will look right for a few months and then blister, stain or grow mould, and by then you have paid for the decoration twice as well as the drying you avoided. It costs nothing to have the readings taken before you commit to the finish. If it is dry we will tell you it is dry.'
    },
    {
      q: 'Will my insurance pay for this?',
      a:
        'Escape of water is covered by most household buildings policies, and a sudden burst or appliance failure is normally straightforward. Damage that has developed slowly, from a joint that has been weeping for a year say, is commonly excluded under gradual damage wording. Your insurer decides that, not us. What we supply is the evidence they assess it on: the source, the extent, the readings and a scope with a price. The survey fee itself is payable by you, and anything you recover from your insurer afterwards is between the two of you.'
    },
  ],
  related: ['penetrating-damp', 'wet-and-dry-rot', 'damp-surveys']
};
