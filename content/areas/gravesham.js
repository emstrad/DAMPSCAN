/* Gravesham. Housing stock notes are the point of this file: the shared framing
   around them lives in scripts/area-template.js. */
export default {
  slug: 'gravesham',
  site: 'dampscan',
  name: 'Gravesham',
  title: 'Damp & Mould Surveys in Gravesham | DampScan',
  metaDescription:
    'Damp, mould and timber surveys across Gravesham, DA11, DA12 and DA13. Written report within 24 hours of the visit.',
  h1: 'Damp and mould surveys in Gravesham',
  intro:
    'Gravesham runs from the Thames at Gravesend up onto the North Downs, so a property here is either on low riverside ground or on chalk several hundred feet above it. The riverside town is largely Georgian and Victorian; the villages on the downs are older and built of very different material.',
  stock: [
    'Gravesend itself has a substantial stock of Georgian and Victorian brick close to the river, some of it with cellars and much of it on ground that is low and, historically, marshy. Cellars here can be affected by ground water as a matter of geology rather than defect, and the distinction matters because one is managed with drainage and pumping and the other is repaired.',
    'The town also carries the legacy of an industrial and maritime past, including terraces built for dock and cement workers, densely arranged with shared rear passageways. Those passageways drain poorly, ground levels in them have risen with resurfacing, and rear closet wings frequently share a valley gutter between two houses. A single blockage affects both properties at once.',
    'Up on the downs at Meopham, Cobham and the surrounding villages the building is older and often ragstone, flint or timber framed with lime mortar. These need permeable repair. Cement pointing and render on a flint or ragstone wall stops it releasing what it takes in, and the moisture reappears on the inside face where it is misread as a rising problem.',
  ],
  common: [
    'Ground water in riverside cellars, needing management rather than repair',
    'Shared rear passageways with poor drainage and raised ground levels',
    'Valley gutters shared between closet wings, blocking and affecting both houses',
    'Flint and ragstone walls repointed in cement and no longer able to dry',
    'Timber framed village property rendered or plastered with impermeable modern materials',
    'Bridged damp proof courses on the interwar and post-war stock around the town',
  ],
  coverage:
    'We cover Gravesend, Northfleet and the villages up onto the North Downs.',
  places: ['Gravesend', 'Northfleet', 'Meopham', 'Higham', 'Cobham', 'Istead Rise', 'Shorne', 'Vigo', 'Sole Street'],
  districts: ['DA11', 'DA12', 'DA13'],
  faq: [
    {
      q: 'Can a flint or ragstone wall be repointed in ordinary mortar?',
      a:
        'It should not be. These are rubble walls bound with lime, and they work by taking in some water through the face and joints and releasing it again. Cement pointing is far less permeable than the stone around it, so water that gets in cannot get out through the joints and moves inwards instead, appearing on the internal face. It also concentrates stress at the stone face, which causes spalling. Repointing in a suitable lime mortar is the durable answer and it is usually cheaper than the internal treatment proposed instead.'
    },
    {
      q: 'Our cellar is damp. Is that a defect?',
      a:
        'Near the river it very often is not, in the sense that nothing has failed. Ground water levels on low lying land vary with rainfall and with the river, and a cellar below that level will be affected. That is a condition to be managed with drainage, pumping and appropriate finishes, not a fault to be repaired. Knowing which situation you are in matters, because tanking against a variable water table without drainage sized for it tends to move the problem rather than solve it.'
    },
  ],
  nearby: ['dartford', 'medway']
};
