/* Dover. Housing stock notes are the point of this file: the shared framing
   around them lives in scripts/area-template.js. */
export default {
  slug: 'dover',
  site: 'dampscan',
  name: 'Dover',
  title: 'Damp & Mould Surveys in Dover | DampScan',
  metaDescription:
    'Damp, mould and timber surveys across Dover, Deal and the surrounding villages, CT14 to CT17. Written, evidence-based reports.',
  h1: 'Damp and mould surveys in Dover',
  intro:
    'Dover is chalk, cliff and coast, with a town built into a valley between two areas of high ground. Exposure is severe on the seaward side, the chalk drains fast and unpredictably, and the older housing includes a good deal of flint and chalk block that behaves quite differently from brick.',
  stock: [
    'Flint and chalk block walls, common in the older stock here and in the surrounding villages, are rubble constructions bound in lime. Chalk block in particular is soft and highly absorbent, and it depends entirely on being kept dry by a permeable render and on being able to release what it does take in. Cement render on a chalk block wall is one of the more destructive things that can be done to a building in this district, and it is not rare.',
    'The seafront and exposed elevations take severe wind driven rain, and the salt that comes with it accumulates in masonry and keeps meter readings high after the wall has dried. As along the rest of the Kent coast, interpreting a reading matters more than taking one.',
    'The town sits in a valley cut into chalk, so surface and near surface water moves quickly downhill toward buildings during heavy rain, and the properties cut into the valley sides retain ground on their uphill elevation. Damp on an uphill wall here is lateral water and it is dealt with outside, by interception and drainage, rather than by anything applied to the internal face.',
  ],
  common: [
    'Cement render on soft, absorbent chalk block walls, preventing them from drying',
    'Flint and rubble walls repointed in cement and no longer able to release moisture',
    'Salt contamination from severe coastal exposure, giving misleading readings',
    'Lateral water against the uphill elevation of properties cut into the valley sides',
    'Surface water running downhill at buildings during heavy rain on chalk',
    'Timber decay in structures built into persistently wet rubble walls',
  ],
  coverage:
    'We cover Dover, Deal, Sandwich and the villages along the coast and up onto the downs.',
  places: ['Dover', 'Deal', 'Sandwich', 'Walmer', 'St Margarets at Cliffe', 'Kingsdown', 'Aylesham', 'Whitfield', 'River'],
  districts: ['CT14', 'CT15', 'CT16', 'CT17'],
  faq: [
    {
      q: 'What is chalk block and why does it matter?',
      a:
        'It is exactly what it sounds like: blocks cut from chalk, used as a walling material in areas where it was the cheapest thing available, and present in a good deal of older building around Dover and the downs. It is soft, highly absorbent and structurally adequate only while it stays dry. It relies on a permeable external render to keep the weather off and on being able to dry out. Seal it with cement render and it holds water, softens and degrades, and the damage is to the wall itself rather than to the finish.'
    },
    {
      q: 'Damp on the uphill wall of our house. Rising or something else?',
      a:
        'On a property cut into a chalk valley side it is almost always lateral rather than rising. The ground behind the wall is retaining water, and on chalk it arrives quickly during rainfall rather than accumulating slowly. It is usually seasonal and correlates with weather. The remedy is outside and uphill of the wall: intercepting the water and taking it away before it arrives. Injecting a damp proof course into a retaining wall achieves nothing, because the water is not coming from below.'
    },
  ],
  nearby: ['folkestone-and-hythe', 'canterbury']
};
