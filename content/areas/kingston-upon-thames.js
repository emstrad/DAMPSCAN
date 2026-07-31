/* Kingston upon Thames. Housing stock notes are the point of this file: the shared framing
   around them lives in scripts/area-template.js. */
export default {
  slug: 'kingston-upon-thames',
  site: 'ati',
  name: 'Kingston upon Thames',
  title: 'Damp Surveys in Kingston upon Thames | ATi Damp Survey',
  metaDescription:
    'Independent damp and timber surveys across Kingston upon Thames, KT1 to KT6. Written, evidence-based reports.',
  h1: 'Independent damp surveys in Kingston upon Thames',
  intro:
    'Kingston is a riverside borough, and that is the first thing to establish about any property in it: whether it is in the flood plain, and how it has been treated if so. Beyond the river, the stock is Victorian and Edwardian through Kingston and Surbiton, with substantial interwar and post-war housing behind it.',
  stock: [
    'Properties in and near the tidal flood plain need looking at differently. Historic flooding leaves salts in masonry that keep a meter reading high for years afterwards, long after the wall itself has dried. A conductivity meter cannot tell salt from water, so a flood affected wall can be repeatedly diagnosed as damp and repeatedly treated for it. Interpretation, not measurement, is what settles that.',
    'The Victorian and Edwardian terraces and villas through Surbiton and Kingston are solid or early cavity brick, largely extended at the rear. The junction between old brickwork and a newer extension roof is the usual entry point, and rear closet wing gutters are the usual blockage. Both produce damp on an internal wall some distance from the defect.',
    'The interwar and post-war housing at New Malden, Chessington and Tolworth is cavity walled with working damp proof courses. The common finding is external ground raised above the course by successive drives and patios, and blocked airbricks under suspended floors, neither of which needs a chemical remedy.',
  ],
  common: [
    'Salt contamination in flood affected masonry giving high meter readings long after drying',
    'Flashings and upstands where a rear extension meets the original brickwork',
    'Blocked closet wing and rear gutters producing damp on an internal wall',
    'Ground raised above the damp proof course on interwar and post-war housing',
    'Blocked airbricks and musty suspended timber ground floors',
    'Pre purchase surveys where a flood history needs assessing properly rather than assumed',
  ],
  coverage:
    'We survey across the borough, from Kingston and Surbiton out through New Malden and Tolworth to Chessington.',
  places: ['Kingston', 'Surbiton', 'New Malden', 'Tolworth', 'Chessington', 'Norbiton', 'Berrylands', 'Coombe', 'Hook'],
  districts: ['KT1', 'KT2', 'KT3', 'KT4', 'KT5', 'KT6'],
  faq: [
    {
      q: 'The house flooded years ago. Why does it still read damp?',
      a:
        'Because flood water leaves salts behind in the masonry, and salts are hygroscopic: they draw moisture from the air and they conduct electricity. A conductivity meter responds to both, so a wall that has dried out completely can still give high readings for years. That is one of the most common reasons flood affected houses are treated repeatedly for damp they no longer have. Distinguishing salt from moisture requires more than a surface meter, and it is worth doing before anyone re plasters again.'
    },
    {
      q: 'We are buying near the river. What should the survey cover?',
      a:
        'Flood history and how it was dealt with, first. Then whether the ground floor construction, finishes and services are appropriate for a property that may flood again, and whether previous reinstatement used materials that will survive it. Beyond that it is a normal survey: ground levels, drainage, rainwater goods, roof and extension junctions, and calibrated readings interpreted with the salt question in mind rather than taken at face value.'
    },
  ],
  nearby: ['richmond-upon-thames', 'sutton']
};
