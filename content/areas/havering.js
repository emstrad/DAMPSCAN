/* Havering. Housing stock notes are the point of this file: the shared framing
   around them lives in scripts/area-template.js. */
export default {
  slug: 'havering',
  site: 'ati',
  name: 'Havering',
  title: 'Damp Surveys in Havering | ATi Damp Survey',
  metaDescription:
    'Independent damp and timber surveys across Havering, RM1 to RM14. Written, evidence-based reports for owners, buyers and landlords.',
  h1: 'Independent damp surveys in Havering',
  intro:
    'Havering is outer London in character and largely interwar and post-war in construction, with a rural fringe that most of the capital does not have. Romford and Hornchurch are suburb; out towards Upminster and the Essex boundary there are older cottages, weatherboarding and buildings that predate anything else in the borough by two centuries.',
  stock: [
    'The suburban bulk is cavity walled semi and detached with a functioning damp proof course. The overwhelmingly common cause of low level damp is external ground raised above that course by successive drives, paths and patios, followed by blocked airbricks under suspended timber floors. Both are cheap to establish and cheap to fix, and both are routinely misdiagnosed as something requiring injection.',
    'On the rural fringe the stock changes completely: timber frame, weatherboarding, and solid walls with lime mortar, some of it several centuries old. These buildings depend on breathing. Cement render, gypsum plaster and modern masonry paint on them trap moisture against structural timber, and the decay that follows is expensive and slow to appear. Any recommendation on a building of that age has to be permeable.',
    'The borough also has a great deal of larger post-war housing and estates where ventilation, rather than water ingress, is the issue. Where windows have been replaced without trickle vents, or an extract discharges into a roof void, condensation appears in a house with nothing structurally wrong with it at all.',
  ],
  common: [
    'Ground levels raised above the damp proof course on interwar and post-war housing',
    'Blocked airbricks and musty suspended ground floors',
    'Cement render and gypsum plaster trapping moisture against timber frame on the rural fringe',
    'Weatherboarding that has cupped, split or been over painted until it holds water',
    'Windows replaced without trickle vents, with condensation following',
    'Extract fans discharging into roof voids rather than to outside air',
  ],
  coverage:
    'We survey across the borough, from Romford and Hornchurch out through Upminster and Rainham to the Essex boundary.',
  places: ['Romford', 'Hornchurch', 'Upminster', 'Rainham', 'Collier Row', 'Elm Park', 'Harold Wood', 'Gidea Park', 'Cranham'],
  districts: ['RM1', 'RM2', 'RM3', 'RM5', 'RM7', 'RM11', 'RM12', 'RM13', 'RM14'],
  faq: [
    {
      q: 'Our cottage is old and the walls read damp everywhere. Is that normal?',
      a:
        'On a solid walled lime built cottage, a moisture meter will often read high across the whole wall, and that on its own does not tell you very much. These walls hold and release moisture as part of how they work, and meters respond to salts as well as water. What matters is whether the moisture is at a level that puts timber at risk, whether it is drying, and whether something modern is preventing it from drying. That is an interpretation job, not a reading job.'
    },
    {
      q: 'Is weatherboarding a problem or a benefit?',
      a:
        'A benefit, while it is maintained. It is a rain screen: it sheds water off the structure and lets air move behind it. It stops working when boards cup or split at the fixings, when laps have been sealed by repeated repainting, or when ground or paving has been built up against the bottom boards. That last one is the serious version, because the sole plate behind is structural and it is the first thing to decay.'
    },
  ],
  nearby: ['redbridge', 'barking-and-dagenham']
};
