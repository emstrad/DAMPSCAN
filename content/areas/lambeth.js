/* Lambeth. Housing stock notes are the point of this file: the shared framing
   around them lives in scripts/area-template.js. */
export default {
  slug: 'lambeth',
  site: 'ati',
  name: 'Lambeth',
  title: 'Damp Surveys in Lambeth | ATi Damp Survey',
  metaDescription:
    'Independent damp and timber surveys across Lambeth, SW2, SW4, SW8, SW9, SE11, SE24 and SE27. Reports for owners, leaseholders and landlords.',
  h1: 'Independent damp surveys in Lambeth',
  intro:
    'Lambeth is late Georgian at its northern end, dense Victorian terrace through the middle, and large post-war estate at several points across it. The borough also has a great many houses converted into flats in the seventies and eighties, and that generation of conversion is now old enough that its weakest details are failing all at once.',
  stock: [
    'The Kennington and Vauxhall Georgian terraces are solid brick with lower ground floors and front lightwells, and they suffer the same way as their counterparts north of the river: a lightwell that has been decked or planted bridges the wall, and a rear garden raised by successive landscaping puts ground above internal floor level. What gets called rising damp on a lower ground wall here is usually external ground doing exactly what it is being allowed to do.',
    'The Victorian terraces through Brixton, Clapham and Streatham are mostly flats now. The recurring defect is the rear closet wing and its valley or parapet gutter, frequently shared with the neighbour and almost never cleared. Water from a blocked shared gutter enters both houses at the same level and is generally blamed on whichever flat notices it first.',
    'The estates fail at cold bridges and panel joints. In a borough with a lot of disrepair activity, the useful distinction is between mould that follows the structure, which is a defect, and mould distributed evenly across a room with an extract that moves nothing, which is a ventilation failure and also a defect. Neither is a lifestyle problem, and our reports say so with readings rather than adjectives.',
  ],
  common: [
    'Front lightwells decked or planted over, bridging the wall of a lower ground room',
    'Shared valley gutters between closet wings overflowing into two houses at once',
    'Ageing seventies and eighties flat conversions where roofs, stacks and extensions are failing together',
    'Cold bridging in estate housing, showing as mould that follows slabs and reveals',
    'Extract fans ducted into voids rather than to outside air',
    'Timber decay in closet wing floors after years of slow overflow',
  ],
  coverage:
    'We survey across the borough, from Waterloo and Kennington out through Brixton and Clapham to Streatham and West Norwood.',
  places: ['Brixton', 'Clapham', 'Streatham', 'Kennington', 'Vauxhall', 'Herne Hill', 'West Norwood', 'Stockwell', 'Tulse Hill'],
  districts: ['SW2', 'SW4', 'SW8', 'SW9', 'SE11', 'SE24', 'SE27'],
  faq: [
    {
      q: 'Our neighbour has damp in the same place we do. What does that mean?',
      a:
        'In a terrace it usually means a shared defect rather than a coincidence. Closet wing valley gutters, parapet gutters and rear passageway drainage are frequently shared between two houses, and when one blocks it affects both. That is generally good news for diagnosis, because it points at something specific rather than at your wall in particular. It does mean the repair may need both owners, which is a further reason to have an independent report saying precisely what and where the defect is.'
    },
    {
      q: 'The flat conversion was done in the eighties. Is that relevant?',
      a:
        'Very. Flat roofs over rear extensions have a service life, and a lot of Lambeth conversion work is now well past it. So are the felt, the flashings and the boxed in stacks that were installed at the same time. When several details reach the end of their life together, a building that was fine for thirty years develops three leaks in two winters. Knowing the conversion date changes where we look first.'
    },
  ],
  nearby: ['southwark', 'wandsworth']
};
