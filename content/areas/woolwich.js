/* Woolwich and Plumstead. Housing stock notes are the point of this file: the
   shared framing around them lives in scripts/area-template.js. */
export default {
  slug: 'woolwich',
  site: 'ati',
  name: 'Woolwich and Plumstead',
  metaDescription:
    'Independent damp and timber surveys in Woolwich, Plumstead and the Thamesmead edge, SE18 and SE28. Evidence-based written reports.',
  h1: 'Independent damp surveys in Woolwich and Plumstead',
  intro:
    'Woolwich and Plumstead climb from the Thames up to the commons and Shooters Hill, so a short walk takes in riverside flats on low ground, long Victorian terraces stepping up a slope, and houses on the heavy clay of the hill. Where a property sits on that climb tells us a good deal about how water reaches it before we arrive.',
  stock: [
    'Plumstead is mostly late Victorian and Edwardian terraces built in long runs up the hillside between the High Street and Plumstead Common. On a slope, each house has its uphill neighbour\'s ground against its back wall and its rear yard set higher than the floor inside. Damp at the back of a ground floor here is frequently water draining downhill and being held against the brick by a concreted yard, rather than anything rising from below.',
    'Woolwich carries the town\'s military and industrial past: the converted buildings of the Royal Arsenal, older barracks and institutional blocks, and a great deal of new riverside housing around them. Thick solid walls converted into sealed modern flats are a particular combination. Old brick that once dried freely now sits behind dry lining and modern finishes, and the moisture it holds shows up as staining, salts or mould at the edges of the lining rather than in the open wall.',
    'Towards the river and the Thamesmead edge the ground is low and the water table is close beneath it, and much of the housing is post-war concrete or recent airtight construction. Up on Shooters Hill the reverse applies: clay that holds water and moves with the seasons, larger interwar and older houses, and mature trees close to foundations and drains.',
  ],
  common: [
    'Rear walls of hillside terraces wetted by water running down from higher yards and gardens',
    'Moisture trapped behind dry lining in converted solid walled military and industrial buildings',
    'Condensation and mould in airtight riverside flats where ventilation has been turned down or blocked',
    'Cold bridging at slabs and balconies in post-war concrete blocks near the river',
    'Cracked drains and gullies on the clay around Shooters Hill letting water into the ground beside the wall',
    'Shared back additions and gutters between Plumstead terraces overflowing into both houses',
  ],
  coverage:
    'We survey across Woolwich and Plumstead, from the riverside and the Arsenal up to Plumstead Common and Shooters Hill, and out to the Thamesmead edge.',
  places: ['Woolwich', 'Plumstead', 'Plumstead Common', 'Shooters Hill', 'Royal Arsenal', 'Woolwich Common', 'Abbey Wood', 'Thamesmead'],
  districts: ['SE18', 'SE28'],
  towns: [
    {
      name: 'Plumstead',
      text: 'Long terraces on a steady slope, many still single houses and many split into two flats. Rear yards paved level with or above the back door, downpipes discharging onto the paving and shared gutters over the back additions are where we usually start.'
    },
    {
      name: 'Woolwich and the Arsenal',
      text: 'Converted historic buildings, Victorian streets behind the town centre and large modern developments by the river. Lined solid walls, sealed new flats and leaks from communal roofs and terraces above are the recurring questions.'
    },
    {
      name: 'Shooters Hill and the Thamesmead edge',
      text: 'Two very different ends of the area. The hill has clay ground, trees and older detached and semi detached houses; the marsh edge has concrete estate housing on low, wet ground. Each needs its own reading of the floor and the walls.'
    },
  ],
  faq: [
    {
      q: 'Our Plumstead terrace is damp only on the back wall. Why there?',
      a:
        'On a hillside the back wall is often the one with ground or paving against it that sits higher than the floor inside, and water running down the slope collects there. We check the levels outside against the damp proof course and the floor, the falls on the yard, where the downpipes discharge and the condition of the gully, because those usually explain a damp back wall better than the wall itself does.'
    },
    {
      q: 'We bought a flat in a converted Arsenal building and there are marks at the bottom of the walls. Is that rising damp?',
      a:
        'Not necessarily. Thick old walls hold moisture for a long time, and once they are lined and sealed that moisture can show at the base or edges of the lining. Salts, a leak from above or a cold corner can look similar. We take readings in the wall and the lining, look at the external condition and the details around the flat, and the report says which is happening.'
    },
    {
      q: 'Is damp in a new riverside flat always condensation?',
      a:
        'Often, but not always. New buildings can leak at balconies, window junctions and roof terraces, and a flat can also be wet from construction moisture in its first winters. We measure humidity, surface temperatures and the ventilation actually being delivered, and check for water coming in, so the report separates a building fault from how the flat is being used.'
    },
    {
      q: 'Does the clay on Shooters Hill cause damp?',
      a:
        'Clay itself does not make a wall damp, but it holds water against the ground and moves as it wets and dries, which can crack drains and gullies. A leaking drain beside a wall is a common hidden cause of damp low down, so we look at how surface water is carried away as well as at the wall.'
    },
    {
      q: 'Will your report tell us what work is needed?',
      a:
        'Yes. It sets out the cause, the evidence for it and what needs doing, in enough detail for any contractor to price it. We carry out no remedial work ourselves, so the recommendation is only what the building needs.'
    },
  ],
  nearby: ['greenwich', 'bexley']
};
