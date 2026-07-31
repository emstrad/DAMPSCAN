/* Hillingdon. Housing stock notes are the point of this file: the shared framing
   around them lives in scripts/area-template.js. */
export default {
  slug: 'hillingdon',
  site: 'ati',
  name: 'Hillingdon',
  title: 'Damp Surveys in Hillingdon | ATi Damp Survey',
  metaDescription:
    'Independent damp and timber surveys across Hillingdon, UB3 to UB10, HA4 and HA6. Written, evidence-based reports.',
  h1: 'Independent damp surveys in Hillingdon',
  intro:
    'Hillingdon is Metroland at its western end, with the interwar semis that followed the Metropolitan line, and industrial era housing around Hayes and Southall built for the factories. It also sits on Thames gravel over clay through much of its area, which matters for drainage and for what happens under solid floors.',
  stock: [
    'The interwar suburb through Ruislip, Ickenham and Eastcote is cavity walled with functioning damp proof courses, airbricks and suspended timber floors. The dominant fault is the one that dominates every interwar borough: ground level raised over ninety years of drives, paths and patios until it bridges the course. It presents as low level damp on an internal wall and is misdiagnosed as rising damp with monotonous regularity.',
    'The Hayes and Yiewsley housing built for the factories is smaller, denser and often solid walled, with less generous foundations and, in the older examples, damp proof courses that are either failing or absent. That is one of the few contexts in the borough where a genuine rising damp diagnosis is plausible, and it still needs establishing rather than assuming.',
    'The gravel over clay produces free draining ground near the surface with a much slower layer beneath, so water can perch above the clay and move laterally toward buildings. Combined with mature trees and ageing clay drainage, displaced drains under solid floors are a recurring finding, giving persistent localised damp that no wall treatment addresses.',
  ],
  common: [
    'Ground raised above the damp proof course on interwar Metroland semis',
    'Older solid walled housing where a damp proof course is failing or absent',
    'Water perching on clay beneath free draining gravel and moving toward buildings',
    'Displaced and root damaged drains under solid ground floors',
    'Blocked airbricks and musty suspended timber ground floors',
    'Slumped or bridging retrofit cavity insulation on weather exposed elevations',
  ],
  coverage:
    'We survey across the borough, from Uxbridge and Ruislip out through Hayes and Yiewsley to West Drayton and Northwood.',
  places: ['Uxbridge', 'Ruislip', 'Hayes', 'Northwood', 'Ickenham', 'Eastcote', 'West Drayton', 'Yiewsley', 'Harefield'],
  districts: ['UB3', 'UB4', 'UB7', 'UB8', 'UB9', 'UB10', 'HA4', 'HA6'],
  faq: [
    {
      q: 'Is rising damp ever the right diagnosis?',
      a:
        'Yes, and it is far rarer than it is diagnosed. It requires a wall in contact with damp ground and either no damp proof course or one that has genuinely failed, which in this borough mostly means older solid walled housing rather than the interwar stock. Even then, it has to be distinguished from a bridged course, a defective drain and lateral water. The point is not that rising damp does not exist, it is that four other things look exactly like it and three of them are cheaper to put right.'
    },
    {
      q: 'What does the ground under the house have to do with it?',
      a:
        'More than most people expect. Free draining gravel over clay lets water move down easily and then stops it, so it can perch on the clay and travel sideways toward a building rather than continuing down. That produces lateral water at foundation level, which behaves nothing like rising damp and does not respond to the same remedies. It also means drainage runs matter, because a leaking drain in that ground disperses less readily than it would in chalk.'
    },
  ],
  nearby: ['harrow', 'hounslow']
};
