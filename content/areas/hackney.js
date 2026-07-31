/* Hackney. Housing stock notes are the point of this file: the shared framing
   around them lives in scripts/area-template.js. */
export default {
  slug: 'hackney',
  site: 'ati',
  name: 'Hackney',
  title: 'Damp Surveys in Hackney | ATi Damp Survey',
  metaDescription:
    'Independent damp and timber surveys across Hackney, E5, E8, E9, N1 and N16. Evidence-based written reports with no remedial work to sell.',
  h1: 'Independent damp surveys in Hackney',
  intro:
    'Hackney has three quite different building stocks sitting side by side, and they fail in three different ways. Victorian terraces, former industrial buildings turned into flats, and a very large amount of post-war council housing. A surveyor who treats all three the same will get at least two of them wrong.',
  stock: [
    'The Victorian terraces are London stock brick, solid walled, and mostly converted into flats. The recurring problem is that the conversion divided the house horizontally but left the drainage, the roof and the walls shared. A leak from a flat roof over a rear extension, or a soil stack boxed in during a refit, presents in the flat below as a damp wall, and the leaseholder who has the damp is rarely the one who owns the defect.',
    'The warehouse conversions around Hackney Wick, Fish Island and the Shoreditch fringe bring a different set. Very large single glazed openings, exposed brick left uninsulated as a design feature, concrete or steel structure with serious thermal bridges, and open plan volumes with mechanical ventilation that was commissioned once and never balanced again. Condensation in these buildings is a design and commissioning problem, not an occupant behaviour problem, whatever the managing agent has written.',
    'The post-war blocks, including a great deal of system build, have their own signature: cold bridging at concrete floor slabs and window reveals, and mould that runs in a neat band along the junction rather than spreading from a source. Where a disrepair claim is involved, the distinction between a building defect and occupation is the whole case, and it is what our report is written to establish.',
  ],
  common: [
    'Damp in a converted flat traced to a shared rear extension roof or a boxed in soil stack, not to the leaseholder\'s own wall',
    'Mould banding along a concrete slab or window reveal in a post-war block, which is cold bridging rather than lifestyle',
    'Condensation in a warehouse conversion with exposed brick, single glazing and a ventilation system that was never balanced',
    'Housing disrepair cases needing a report that will stand up when it is put in front of the other side',
    'Timber decay at joist ends built into a solid external wall that has been dry lined',
    'Penetrating damp through a parapet or a poorly detailed rear addition roof',
  ],
  coverage:
    'We cover the borough and the surrounding streets, from Shoreditch up to Stamford Hill and across to Hackney Wick.',
  places: ['Dalston', 'Stoke Newington', 'Hackney Central', 'London Fields', 'Clapton', 'Homerton', 'Shoreditch', 'Hackney Wick', 'Stamford Hill'],
  districts: ['E2', 'E5', 'E8', 'E9', 'E20', 'N1', 'N16'],
  faq: [
    {
      q: 'Our managing agent says the mould is condensation and therefore our problem. Is that right?',
      a:
        'Sometimes, and often not. Condensation forms where a surface is below the dew point of the air in the room, and a surface can be cold because of how the building was built rather than because of how it is lived in. Mould in a neat band along a concrete slab or a window reveal is cold bridging. Mould evenly across a room with an unbalanced or unducted extract is a ventilation failure. Both are building defects. Our report says which it is, with the readings behind it.'
    },
    {
      q: 'We are in a leasehold flat and the damp seems to come from outside our demise. What then?',
      a:
        'That is one of the most common situations in Hackney and one of the most useful things an independent report does. We record where the water is entering and where it goes, whether that is a shared parapet, a valley gutter, a rear extension roof or a stack in a riser. You are then arguing about a documented defect and whose repairing obligation it falls under, rather than about whose fault it is.'
    },
  ],
  nearby: ['islington', 'camden']
};
