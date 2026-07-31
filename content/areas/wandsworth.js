/* Wandsworth. Housing stock notes are the point of this file: the shared framing
   around them lives in scripts/area-template.js. */
export default {
  slug: 'wandsworth',
  site: 'ati',
  name: 'Wandsworth',
  title: 'Damp Surveys in Wandsworth | ATi Damp Survey',
  metaDescription:
    'Independent damp and timber surveys across Wandsworth, SW11, SW12, SW17 and SW18. Written, evidence-based reports with nothing to sell.',
  h1: 'Independent damp surveys in Wandsworth',
  intro:
    'Wandsworth is dominated by late Victorian and Edwardian terraces built quickly for a growing suburb, and by what has been done to them since. Almost every house between the commons has been extended at the back, dug out underneath, or both, and the damp we are asked to look at is usually sitting at the junction between the original house and whatever was added to it.',
  stock: [
    'The standard house is solid brick with a two storey rear closet wing, a slate roof and a valley or parapet gutter somewhere it cannot easily be seen. Side return infills are near universal now. The junction between a new flat roof and the original brickwork is the single most productive source of penetrating damp in this borough: a flashing that was chased in badly, an upstand that is too shallow, or an outlet that ponds. It shows up internally as a damp patch on a first floor wall, well away from the actual defect.',
    'Basement conversions are the other Wandsworth speciality. A dug out and tanked basement is a sealed box below ground with a pump in it. When it works, it works. When it fails, it fails comprehensively, and the failure is usually a blocked perimeter drainage channel, a pump nobody has serviced, or a tanking system that was lapped incorrectly at a service penetration. We are frequently the second opinion after a first firm has proposed re tanking the whole thing.',
    'Proximity to the Wandle and the Thames matters less than people expect for rising groundwater and more than people expect for the age and condition of drainage. A lot of the original clay drainage under these streets is now at the end of its life, and a cracked drain under a solid floor produces a persistent, localised damp patch that no amount of injected damp proof course will touch.',
  ],
  common: [
    'Damp on a first floor wall traced to the flashing or upstand where a side return infill meets the original brickwork',
    'A converted basement with water coming back, where the cause is drainage channel blockage or a pump, not the tanking itself',
    'A second opinion on a quote for re tanking or a chemical damp proof course running into thousands',
    'Persistent localised damp over a cracked clay drain beneath a solid ground floor',
    'Timber decay in the closet wing where a valley gutter has been overflowing for years',
    'Condensation and mould in a rear bedroom after the loft was converted and the ventilation path was lost',
  ],
  coverage:
    'We survey across the borough and the streets around it, from Battersea and Clapham Junction out to Earlsfield and Tooting.',
  places: ['Battersea', 'Clapham Junction', 'Balham', 'Tooting', 'Earlsfield', 'Southfields', 'Putney', 'Wandsworth Common', 'Nine Elms'],
  districts: ['SW11', 'SW12', 'SW15', 'SW17', 'SW18'],
  faq: [
    {
      q: 'We have been quoted for a chemical damp proof course. Should we get a second opinion?',
      a:
        'Yes, and it is one of the most common reasons people call us in this borough. An injected damp proof course treats rising damp. If the moisture is coming from a failed side return flashing, a cracked drain or a bridged external ground level, injecting the wall changes nothing and the problem returns once the replastering has dried. We survey independently, we do not carry out remedial work, and we will tell you plainly when the work you have been quoted for is not justified.'
    },
    {
      q: 'Our basement conversion is damp again. Does it all need redoing?',
      a:
        'Usually not. Most of the failures we see in Wandsworth basements are in the maintainable parts rather than the waterproofing itself: a silted perimeter channel, a sump pump that has never been serviced, or a detail around a service penetration. Those are a fraction of the cost of a re tank. We inspect the whole system, including the parts a re tanking quote tends not to mention, and say what has actually failed.'
    },
  ],
  nearby: ['croydon', 'lewisham']
};
