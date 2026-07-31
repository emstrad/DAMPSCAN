/* Folkestone and Hythe. Housing stock notes are the point of this file: the shared framing
   around them lives in scripts/area-template.js. */
export default {
  slug: 'folkestone-and-hythe',
  site: 'dampscan',
  name: 'Folkestone and Hythe',
  title: 'Damp & Mould Surveys in Folkestone and Hythe | DampScan',
  metaDescription:
    'Damp, mould and timber surveys across Folkestone, Hythe and Romney Marsh, CT18 to CT21 and TN28 to TN29.',
  h1: 'Damp and mould surveys in Folkestone and Hythe',
  intro:
    'This district runs from the chalk escarpment above Folkestone down onto Romney Marsh, which is reclaimed land at or below sea level. Few places in Kent have such a sharp change in ground conditions over so short a distance, and the damp diagnoses change completely with it.',
  stock: [
    'Romney Marsh is drained land, criss crossed by dykes, with a water table close to the surface and, in places, above the level of adjacent ground. Older marsh property is often single storey, solid walled, with little or no damp proof course and floors laid more or less directly on the ground. Damp there is a condition of the site as much as a defect of the building, and it has to be managed with drainage and breathable finishes rather than sealed in.',
    'Folkestone town has Victorian and Edwardian seafront and clifftop terraces, rendered or stucco fronted, heavily exposed to wind driven rain off the Channel. As along the rest of this coast, the render is the weatherproofing, salt accumulates in the masonry and keeps meter readings high after drying, and impermeable modern paint makes both problems worse.',
    'Between the two, the villages under the escarpment sit where water emerges from the chalk at the spring line. That is a specific and predictable thing: springs and seepage appear at a consistent level along the foot of the downs, and buildings on it deal with ground water that arrives laterally rather than rising.',
  ],
  common: [
    'High water table across Romney Marsh, with floors laid close to or on the ground',
    'Older marsh property with no effective damp proof course, needing management not sealing',
    'Cracked or blown render on exposed Folkestone seafront and clifftop elevations',
    'Salt contamination giving high readings long after masonry has dried',
    'Spring line seepage at the foot of the downs producing lateral water at foundation level',
    'Impermeable masonry paint applied over historic lime render',
  ],
  coverage:
    'We cover Folkestone, Hythe, New Romney and the villages across Romney Marsh and under the downs.',
  places: ['Folkestone', 'Hythe', 'New Romney', 'Dymchurch', 'Lydd', 'Sandgate', 'Cheriton', 'Elham', 'Lyminge'],
  districts: ['CT18', 'CT19', 'CT20', 'CT21', 'TN28', 'TN29'],
  faq: [
    {
      q: 'Our marsh cottage has always been damp. Can it be cured?',
      a:
        'It can usually be improved a great deal and it is rarely cured in the sense of being made like a modern house, and it is worth being honest about that. A building with no damp proof course, on ground with a high water table, will always exchange moisture with the ground. The productive approach is management: keeping ground water away from the walls with drainage, using breathable floor and wall finishes that let the building release what it takes up, and ventilating properly. Sealing it in with impermeable materials is what turns a manageable condition into decay.'
    },
    {
      q: 'What is a spring line and how would I know if we are on one?',
      a:
        'It is the level along the foot of a chalk escarpment where water travelling through the chalk meets a less permeable layer and emerges. It runs consistently along the contour, which is why villages under the downs are often strung out along the same line, and why the same damp problem appears in neighbouring properties. If your house sits at the foot of the escarpment and water appears at the uphill wall after wet weather, that is very likely what you are dealing with, and it is handled by interception outside.'
    },
  ],
  nearby: ['dover', 'ashford']
};
