/* Dartford. Housing stock notes are the point of this file: the shared framing
   around them lives in scripts/area-template.js. */
export default {
  slug: 'dartford',
  site: 'dampscan',
  name: 'Dartford',
  title: 'Damp & Mould Surveys in Dartford | DampScan',
  metaDescription:
    'Damp, mould and timber surveys across Dartford, DA1 to DA4 and DA9. The cause diagnosed before anyone recommends a treatment.',
  h1: 'Damp and mould surveys in Dartford',
  intro:
    'Dartford sits on chalk where the Darent meets the Thames, and the two halves of that sentence explain most of what we find. Chalk drains fast, so damp arrives and departs with the weather. The riverside and marsh edge at Stone and Greenhithe is low, alluvial and altogether wetter.',
  stock: [
    'On the chalk, water moves through the ground quickly rather than accumulating, which gives damp a distinctly episodic character: it appears during sustained rain and eases within days. That pattern points at surface water reaching the building, at ground falls and blocked gullies, rather than at anything continuous. It is one of the most useful diagnostic signals available in this part of Kent and it is regularly overlooked in favour of a treatment.',
    'The town has a good deal of Victorian and early twentieth century terrace around the centre, solid walled with rear yards. Successive resurfacing of those yards has raised ground above the damp proof course on many of them. There is also a large amount of interwar and post-war semi across Wilmington, Joydens Wood and Temple Hill, cavity walled with courses that generally still work, where the same bridging fault dominates.',
    'The riverside at Stone, Greenhithe and Swanscombe is former industrial and quarry land, much of it redeveloped. Made ground behaves unpredictably, drainage is often relatively new but laid in variable material, and the water table near the marsh is high. Solid floors and any below ground space there need assessing on their own terms rather than by the standards of the chalk uphill.',
  ],
  common: [
    'Episodic damp on chalk during sustained rain, pointing at surface water not rising damp',
    'Raised yards and drives bridging the damp proof course on terraces and interwar semis',
    'High water table and made ground affecting solid floors near the riverside and marsh',
    'Blocked airbricks starving the void under suspended timber floors',
    'Redeveloped quarry and industrial land where drainage runs through variable fill',
    'Second opinions on injection quotes where the cause is external and above ground',
  ],
  coverage:
    'We cover Dartford and the surrounding villages, from the Darent valley across to the Thames riverside.',
  places: ['Dartford', 'Wilmington', 'Stone', 'Greenhithe', 'Swanscombe', 'Bean', 'Joydens Wood', 'Sutton at Hone', 'Longfield'],
  districts: ['DA1', 'DA2', 'DA3', 'DA4', 'DA9', 'DA10'],
  faq: [
    {
      q: 'The damp appears after heavy rain then dries out. What does that mean?',
      a:
        'It very largely rules out rising damp, which is slow and steady and does not respond to individual weather events. Damp that tracks the rainfall is arriving from outside: surface water reaching the wall, an overflowing gutter or hopper, driving rain on an exposed elevation, or water moving quickly through chalk. That is genuinely useful evidence, so it is worth noting when it happens and what the weather was doing when it did.'
    },
    {
      q: 'Our house is on redeveloped industrial land. Does that matter?',
      a:
        'It can. Made ground is variable in a way natural ground is not, so drainage and services laid through it settle differently, and water can find routes that would not exist in undisturbed chalk. It does not make damp inevitable, but it does mean the external investigation matters more: ground falls, drainage runs and the condition of gullies and manholes, rather than assuming the answer is in the wall.'
    },
  ],
  nearby: ['medway', 'gravesham']
};
