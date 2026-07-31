/* Medway. Housing stock notes are the point of this file: the shared framing
   around them lives in scripts/area-template.js. */
export default {
  slug: 'medway',
  site: 'dampscan',
  name: 'Medway',
  title: 'Damp & Mould Surveys in Medway | DampScan',
  metaDescription:
    'Damp, mould and timber surveys across Rochester, Chatham, Gillingham and Strood, ME1 to ME8. Survey-led diagnosis, written report in 24 hours.',
  h1: 'Damp and mould surveys across Medway',
  intro:
    'Medway packs Georgian Rochester, Victorian naval terraces and a lot of post-war and later housing into a few miles of riverside, much of it on chalk and much of it on a slope down to the water. The stock is more varied than anywhere else in north Kent and the diagnoses vary with it.',
  stock: [
    'Rochester and the older parts of Chatham hold Georgian and early Victorian brick, solid walled, often with cellars. A cellar cut into chalk with the river below is not the same problem as a cellar in clay: chalk drains, so the water tends to arrive fast during rainfall and go again, which produces a distinctly episodic damp pattern. Tanking a cellar in that situation is sometimes the answer and is frequently sold when improving surface drainage outside would have done it.',
    'The Victorian terraces built for the dockyard are dense, narrow fronted and mostly still solid brick with rear yards. Successive yard resurfacing has raised ground levels against the rear wall on a great many of them, and the shared rear passageways drain badly. Add a rear closet wing with a valley gutter shared between two houses and you have the standard north Kent terrace damp problem, which is almost never rising.',
    'The post-war and later estates across Gillingham, Rainham and Strood are cavity walled with working damp proof courses, and behave like interwar and modern stock everywhere: bridged courses from raised drives, blocked airbricks, failed cavity fill, and condensation where ventilation has been sealed up during a refit or a window replacement.',
  ],
  common: [
    'Cellars in chalk showing episodic damp after rainfall, quoted for full tanking when drainage would do it',
    'Raised rear yards and shared passageways bridging the damp proof course on dockyard terraces',
    'Shared valley gutters between closet wings overflowing into both houses',
    'Bridged damp proof courses and blocked airbricks on the post-war estates',
    'Condensation after window replacement removed the ventilation the house depended on',
    'Timber decay in ground floor joists and cellar heads in the older riverside stock',
  ],
  coverage:
    'We cover the whole of Medway and the surrounding villages, along both banks of the river.',
  places: ['Rochester', 'Chatham', 'Gillingham', 'Strood', 'Rainham', 'Hoo', 'Cuxton', 'Halling', 'Wainscott'],
  districts: ['ME1', 'ME2', 'ME3', 'ME4', 'ME5', 'ME7', 'ME8'],
  faq: [
    {
      q: 'Our cellar floods after heavy rain. Do we need it tanked?',
      a:
        'Possibly, and it is worth establishing where the water is arriving from first. On chalk the water often moves quickly through the ground during rainfall and drains away again afterwards, which is why the damp is episodic rather than constant. In a lot of cases the practical answer is outside: surface water drainage, gully condition, ground falls away from the building and the state of the rainwater goods. Tanking seals the inside of a wall that will still be taking water. Sometimes that is right. It should not be the first thing anyone reaches for.'
    },
    {
      q: 'Our neighbour and we both have damp at the back. Is that a coincidence?',
      a:
        'In a terrace, rarely. Shared valley gutters between rear closet wings, shared passageways with poor drainage, and a continuous run of raised yard level all affect both houses at once. That is usually good news, because it points at a specific shared defect rather than at something wrong with your wall in particular. It does mean the repair may need both owners, which is another reason to have an independent report saying plainly what and where the defect is.'
    },
  ],
  nearby: ['maidstone', 'canterbury']
};
