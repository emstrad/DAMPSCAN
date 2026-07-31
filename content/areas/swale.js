/* Swale. Housing stock notes are the point of this file: the shared framing
   around them lives in scripts/area-template.js. */
export default {
  slug: 'swale',
  site: 'dampscan',
  name: 'Swale',
  title: 'Damp & Mould Surveys in Swale | DampScan',
  metaDescription:
    'Damp, mould and timber surveys across Swale, ME9 to ME13. Sittingbourne, Faversham, Sheerness and the Isle of Sheppey.',
  h1: 'Damp and mould surveys in Swale',
  intro:
    'Swale takes in the historic centre of Faversham, the industrial town of Sittingbourne, and the Isle of Sheppey, which is exposed marshland with a housing stock unlike anything inland. Three quite different sets of problems within twenty miles.',
  stock: [
    'Faversham has one of the best preserved medieval and Georgian town centres in Kent, with timber framed and early brick buildings in daily domestic use, much of it listed. These depend on breathing. The single most damaging thing done to them has been sealing them up with cement render, gypsum plaster and modern masonry paint, which holds moisture against structural timber and produces decay that is slow to appear and expensive to repair.',
    'Sheppey is low, flat and exposed, largely reclaimed marshland with a high water table and very little shelter from wind driven rain off the estuary. Salt carried in that rain accumulates in masonry and is hygroscopic, so walls read damp on a meter long after they have dried. Ground floors and any below ground space have to be assessed against the water table rather than assumed dry, and exposure means the weather side of a building takes far more water than the sheltered side.',
    'Sittingbourne and the paper and brick industry towns brought dense terraced housing, solid walled, with rear yards that have been resurfaced repeatedly. Bridged damp proof courses are the norm there, together with the usual blocked underfloor ventilation. The surrounding villages return to timber frame, weatherboarding and lime.',
  ],
  common: [
    'Cement render and gypsum plaster trapping moisture against timber frame in Faversham',
    'High water table and exposure affecting ground floors across the Isle of Sheppey',
    'Salt contamination from wind driven estuary rain giving misleading meter readings',
    'Raised rear yards bridging the damp proof course on Sittingbourne terraces',
    'Weatherboarding that has cupped, split or been over painted until it holds water',
    'Blocked airbricks and musty suspended timber ground floors',
  ],
  coverage:
    'We cover Sittingbourne, Faversham, Sheerness and the Isle of Sheppey, and the villages between them.',
  places: ['Sittingbourne', 'Faversham', 'Sheerness', 'Minster', 'Queenborough', 'Teynham', 'Milton Regis', 'Iwade', 'Eastchurch'],
  districts: ['ME9', 'ME10', 'ME11', 'ME12', 'ME13'],
  faq: [
    {
      q: 'Why do walls on Sheppey read damp when they look dry?',
      a:
        'Because a conductivity meter responds to salt as well as to water, and exposed estuary locations accumulate salt in masonry from wind driven rain. Those salts draw moisture from the air and conduct, so a wall that has genuinely dried can still give high readings for years. Taking the number at face value is how properties in exposed coastal locations get treated repeatedly for damp they no longer have. Distinguishing the two needs more than a surface meter.'
    },
    {
      q: 'Our Faversham house is listed. What can actually be recommended?',
      a:
        'Whatever is both correct for the fabric and capable of receiving consent, which in practice means lime based repairs, breathable internal finishes, attention to drainage, ground levels and rainwater goods, and ventilation designed for the building rather than bolted onto it. What will not help is a recommendation for external alteration that listed building consent will refuse, or a modern impermeable treatment that will accelerate decay in the frame.'
    },
  ],
  nearby: ['canterbury', 'medway']
};
