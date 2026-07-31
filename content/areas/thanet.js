/* Thanet. Housing stock notes are the point of this file: the shared framing
   around them lives in scripts/area-template.js. */
export default {
  slug: 'thanet',
  site: 'dampscan',
  name: 'Thanet',
  title: 'Damp & Mould Surveys in Thanet | DampScan',
  metaDescription:
    'Damp, mould and timber surveys across Thanet, CT7 to CT12. Margate, Ramsgate, Broadstairs and the surrounding villages.',
  h1: 'Damp and mould surveys in Thanet',
  intro:
    'Thanet is a coastal district on chalk, and the coast is the dominant fact. Exposure to wind driven salt laden rain, Regency and Victorian seafront terraces built for a resort trade, and a high proportion of houses converted into flats. Very little of what we find here is rising damp.',
  stock: [
    'The seafront and clifftop terraces at Margate, Ramsgate and Cliftonville are rendered or stucco fronted brick, and the render is the weatherproofing rather than the finish. On an elevation that takes salt laden rain off the Channel, that render works hard and fails predictably: cracks, hollow areas and blown patches let water into the wall, and modern impermeable masonry paint applied over the top holds it there. Repairs need to be permeable or they make the next winter worse.',
    'Salt accumulates in that masonry over decades and it is hygroscopic, drawing moisture from the air and conducting on a meter. A dried out seafront wall can read as high as a wet one, which is the single biggest reason damp is over diagnosed in this district. Interpretation rather than measurement is what settles it.',
    'A very high proportion of the large seafront houses have been converted into flats, often decades ago and often with limited investment since. Shared roofs, parapets, valley gutters and long rainwater runs mean water entering high in the building appears several floors down in a flat that owns none of the defect, and the leases frequently do not make clear who is responsible for what.',
  ],
  common: [
    'Cracked and blown render on exposed seafront elevations, sealed further by impermeable paint',
    'Salt contamination giving high meter readings long after masonry has dried',
    'Converted seafront houses where a roof or parapet defect lands several floors below',
    'Shared valley gutters and long rainwater runs that nobody has cleared',
    'Timber decay in ground and lower ground structures in persistently wet walls',
    'Chalk ground giving episodic damp that follows rainfall rather than being constant',
  ],
  coverage:
    'We cover Margate, Ramsgate, Broadstairs and the villages across the Isle of Thanet.',
  places: ['Margate', 'Ramsgate', 'Broadstairs', 'Cliftonville', 'Westgate on Sea', 'Birchington', 'Minster', 'Manston', 'St Peters'],
  districts: ['CT7', 'CT8', 'CT9', 'CT10', 'CT11', 'CT12'],
  faq: [
    {
      q: 'Our seafront flat has damp on the sea facing wall only. Why that wall?',
      a:
        'Because that is the wall taking the weather, and on this coast that means wind driven rain carrying salt, arriving with enough force to be pushed into any defect in the render or pointing. Sheltered elevations of the same building can be perfectly dry. It points the investigation squarely at the external face: render condition, pointing, window and sill detailing and rainwater goods, rather than at anything applied internally.'
    },
    {
      q: 'Is render on a seafront house a bad idea?',
      a:
        'No, it is essential, but it has to be the right render and it has to be maintained. A permeable lime based render sheds water while letting the wall dry between wettings, which is exactly what an exposed elevation needs. Cement render and impermeable masonry paint shed water until they crack, and then hold it in. The failure mode is the problem, not the render itself, and the difference shows up within a few winters.'
    },
  ],
  nearby: ['canterbury', 'dover']
};
