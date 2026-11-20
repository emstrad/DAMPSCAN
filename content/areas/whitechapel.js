/* Whitechapel, Stepney and the Spitalfields edge. Housing stock notes are the
   point of this file: the shared framing around them lives in
   scripts/area-template.js. */
export default {
  slug: 'whitechapel',
  site: 'ati',
  name: 'Whitechapel',
  metaDescription:
    'Independent damp and timber surveys in Whitechapel, Stepney and the Spitalfields edge, E1. Georgian houses, tenement blocks, estates and conversions.',
  h1: 'Independent damp surveys in Whitechapel',
  intro:
    'Whitechapel and Stepney hold almost every kind of London housing in a small space: early Georgian houses built for silk weavers on the Spitalfields side, Victorian tenement blocks put up by housing charities, large council estates, warehouse and factory conversions, and new towers along Whitechapel Road. Each fails in its own way, and the right diagnosis depends on knowing which one you are standing in.',
  stock: [
    'The eighteenth century houses around Spitalfields and Brick Lane were built by and for the silk weaving trade, many with wide windows in the top storey to light the looms. They have thin brick walls by later standards, timber lintels and bressummers buried in the brickwork, panelled rooms and cellars. Where these houses have been restored with lime they generally behave; where cement pointing, gypsum plaster or a sealed cellar floor have gone in, moisture builds up in the brick and the hidden timbers are the first to suffer.',
    'Across Whitechapel and Stepney there are tall Victorian and Edwardian tenement blocks built by philanthropic trusts and the LCC, with balcony or stair access, solid brick walls and flat or shallow roofs. Most are now leasehold and rented flats. Their damp usually comes from above or alongside: flat roofs and asphalt walkways, internal rainwater pipes, and cold solid walls that grow mould behind wardrobes in flats with no extract at all.',
    'Stepney was heavily damaged in the war and rebuilt with large council estates, so much of E1 is post war concrete and brick blocks of every height. Cold bridges at balconies and slab edges, panel joints and tired windows are the recurring faults. The ground is river terrace gravel over clay, which drains well, so damp at the bottom of these buildings is more often plumbing, drainage or condensation than water from the ground.',
  ],
  common: [
    'Decay in timber lintels and bressummers built into the walls of Georgian houses',
    'Damp cellars under old houses where the floor or walls have been sealed with cement',
    'Leaks from flat roofs, asphalt walkways and internal downpipes in tenement blocks',
    'Mould on cold solid walls in tenement and estate flats with no working extract',
    'Cold bridging at balconies and slab edges in post war blocks',
    'Moisture trapped behind linings in converted warehouses and factories',
  ],
  coverage:
    'We survey across E1, from Spitalfields and Brick Lane east along Whitechapel Road to Stepney Green and south towards Shadwell.',
  places: ['Whitechapel', 'Spitalfields', 'Brick Lane', 'Stepney', 'Stepney Green', 'Aldgate East', 'Shadwell', 'Mile End'],
  districts: ['E1'],
  towns: [
    { name: 'Spitalfields edge and Brick Lane', text: 'Early Georgian weavers\' houses in conservation areas, Victorian terraces and converted industrial buildings. Hidden timber in old walls, damp cellars and cement in the wrong places are what we look for.' },
    { name: 'Whitechapel', text: 'Victorian tenement blocks, flats above shops on the main road and new towers. Roof and walkway leaks in the old blocks, condensation and plumbing leaks in the new ones.' },
    { name: 'Stepney', text: 'Large post war estates with Georgian and Victorian survivors around Stepney Green. Cold structure and mould in the blocks, solid wall damp and failed rainwater goods in the older houses.' }
  ],
  faq: [
    {
      q: 'We own a Georgian house near Spitalfields. Should a damp survey worry about the timber?',
      a:
        'Yes, it is one of the main reasons to have one. Houses of this age have timber lintels and beams built into the brickwork, and if the wall around them stays wet they decay out of sight. We take readings at those points and look for the signs of decay, and the report says where the timber needs opening up and checking.'
    },
    {
      q: 'Our cellar was tanked and is still damp. Why?',
      a:
        'A cellar is below ground, so the walls will always take in some water from outside. If the lining has failed at a joint, a drain is leaking or the cellar has no ventilation, it will show. We find where it is getting in and whether condensation is part of it, so the report says what is needed.'
    },
    { q: 'Our flat in an old tenement block has mould on every outside wall. Is that us or the building?', a: 'Often both. Solid walls are cold and many of these flats have no extract fan. We measure the conditions and record which part is the building and which is use.' },
    { q: 'Do you survey council and housing association flats in E1?', a: 'Yes, for tenants, leaseholders and landlords. The report is written with measurements and photographs so both sides can rely on it.' },
    { q: 'Our converted warehouse flat has damp behind the plasterboard. How do you find it?', a: 'We look at how the wall is built up and take readings through and behind the lining where needed, so the report says whether it is rain getting in or condensation inside the wall.' }
  ],
  nearby: ['tower-hamlets', 'city-of-london']
};
