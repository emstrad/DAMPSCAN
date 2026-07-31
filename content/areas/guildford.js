/* Guildford. Housing stock notes are the point of this file: the shared framing
   around them lives in scripts/area-template.js. */
export default {
  slug: 'guildford',
  site: 'dampscan',
  name: 'Guildford',
  title: 'Damp & Mould Surveys in Guildford | DampScan',
  metaDescription:
    'Damp, mould and timber surveys across Guildford, GU1 to GU5. Survey-led diagnosis with a written report within 24 hours of the visit.',
  h1: 'Damp and mould surveys in Guildford',
  intro:
    'Guildford sits where the Wey cuts through the North Downs, which means chalk on the high ground, greensand and clay lower down, and a lot of houses on a slope. Where a house sits on that geology tells you a good deal about what its damp is likely to be before you go inside.',
  stock: [
    'On the chalk, water moves quickly and arrives at a building fast during rainfall rather than accumulating steadily. Damp on the uphill wall of a house cut into the slope is normally surface and near surface water arriving laterally, and the answer is interception and drainage outside rather than anything applied to the inside face. On the clay lower down the pattern reverses: water is held, drainage is slow, and the problems are more persistent and less weather dependent.',
    'The town centre holds timber framed and early brick buildings, many listed, which need the same breathable approach as anywhere else in the south east: lime rather than cement, and finishes that let the structure dry. The Victorian and Edwardian streets around the centre are conventional solid brick with the familiar bridged damp proof courses and defective rainwater goods.',
    'The interwar and post-war housing out through Merrow, Burpham and the surrounding villages is cavity walled with a working damp proof course, so damp there is almost always external in origin: raised ground, blocked airbricks, failed cavity fill, or rainwater goods. On a sloping plot, add garden drainage running at the building, which is the most common single finding we make on the higher ground here.',
  ],
  common: [
    'Lateral water arriving at the uphill wall of a house cut into a slope, needing external interception',
    'Raised drives, patios and garden levels bridging the damp proof course',
    'Blocked or buried airbricks and musty suspended ground floors',
    'Cement render and gypsum plaster on timber framed and early brick buildings in the old town',
    'Failed or slumped retrofit cavity wall insulation showing on the weather exposed elevation',
    'Second opinions on damp proof course quotes where the cause is drainage rather than rising damp',
  ],
  coverage:
    'We cover Guildford and the surrounding villages, across the Surrey Hills and out towards the Hampshire border.',
  places: ['Guildford', 'Godalming', 'Woking', 'Merrow', 'Burpham', 'Shalford', 'Cranleigh', 'Ash', 'Farnham'],
  districts: ['GU1', 'GU2', 'GU3', 'GU4', 'GU5', 'GU7'],
  faq: [
    {
      q: 'Our house is cut into a slope and the back wall is damp. What is that?',
      a:
        'On this geology it is usually lateral water rather than rising damp: the ground behind the wall is retaining water and pushing it through, or surface run off from the garden above is reaching the wall directly. It is often seasonal and correlates with rainfall. The remedy is normally outside and above the wall, intercepting and taking the water away before it arrives, rather than anything applied to the inside face. Injecting a damp proof course into a retaining wall achieves nothing, because the water is not coming from below.'
    },
    {
      q: 'Do you carry out the remedial work you recommend?',
      a:
        'DampScan does carry out remedial work where a client wants us to, and every survey is written so it stands on its own regardless. We diagnose before we quote, we say plainly when no work is needed, and you are under no obligation to use us for anything the report identifies. If you would prefer a report from a practice that does no remedial work at all, our London arm ATi Damp Survey is survey only, though it covers London rather than Surrey.'
    },
  ],
  nearby: ['brighton', 'tunbridge-wells']
};
