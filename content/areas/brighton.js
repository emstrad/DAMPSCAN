/* Brighton. Housing stock notes are the point of this file: the shared framing
   around them lives in scripts/area-template.js. */
export default {
  slug: 'brighton',
  site: 'dampscan',
  name: 'Brighton',
  title: 'Damp & Mould Surveys in Brighton & Hove | DampScan',
  metaDescription:
    'Damp, mould and timber surveys across Brighton and Hove, BN1 to BN3. Regency stucco, bungaroosh and basement flats a speciality.',
  h1: 'Damp and mould surveys in Brighton and Hove',
  intro:
    'Brighton has a wall construction that barely exists anywhere else, and it is the single most important thing to understand before diagnosing damp here. Bungaroosh, a mix of flint, brick rubble, beach cobbles and lime, was used extensively in the Regency and early Victorian expansion of the town. It is structurally capable and it does not tolerate water.',
  stock: [
    'Bungaroosh is bound with lime and depends on staying dry and breathable. Saturate it and the lime binder degrades; the material genuinely can wash out. The stucco or render skin over it is not decoration, it is the raincoat, and once that skin cracks, blows or is patched with cement, water reaches the wall core. Damp in a Regency Brighton house is therefore an urgent structural question rather than a decorative one, and the repair must be in lime and must be permeable.',
    'Basement and lower ground flats are everywhere in the seafront squares and terraces, and most were service floors. They sit below external ground with lightwells at the front that were built to keep soil off the wall and are now often decked, planted or paved over. Combine a bridged lightwell, a cement patch on bungaroosh and a below ground room, and the result is persistent damp that no injected damp proof course will touch.',
    'Then there is the exposure. A seafront elevation takes driving rain carrying salt, and salt in masonry is hygroscopic: it draws moisture from the air and keeps a wall reading damp long after the water ingress has been stopped. This is the single biggest reason a moisture meter is misleading here, because it reads the conductivity that salt provides, not just water. It has to be interpreted rather than simply recorded.',
  ],
  common: [
    'Cement repairs and modern masonry paint over bungaroosh, trapping water in a wall that cannot take it',
    'Cracked or blown stucco letting water into the wall core on Regency and early Victorian terraces',
    'Lightwells decked, planted or paved over, bridging the wall of a lower ground flat',
    'Salt contamination on seafront elevations giving high meter readings long after the ingress has stopped',
    'Basement flats quoted for tanking or injection when the cause is external and above ground',
    'Timber decay in ground floor and lower ground timbers built into a persistently wet wall',
  ],
  coverage:
    'We cover Brighton, Hove and the surrounding area along the Sussex coast and up onto the Downs.',
  places: ['Brighton', 'Hove', 'Kemptown', 'Preston Park', 'Hanover', 'Portslade', 'Rottingdean', 'Patcham', 'Withdean'],
  districts: ['BN1', 'BN2', 'BN3', 'BN41', 'BN45'],
  faq: [
    {
      q: 'What is bungaroosh and why does it matter for damp?',
      a:
        'It is a local wall construction from Brighton\'s Regency expansion: flint, brick rubble, beach cobbles and other material bound in lime and cast between shutters. It is perfectly serviceable while it stays dry, and it degrades when it does not, because sustained water attacks the lime binder itself. That is why the render or stucco over it is a functional raincoat rather than a finish, why repairs must be lime based and permeable, and why cement patching is actively harmful. Damp on a bungaroosh wall should be dealt with promptly.'
    },
    {
      q: 'Our surveyor recorded very high meter readings. Does that prove the wall is wet?',
      a:
        'Not on a seafront property. A conductivity meter responds to anything that conducts, and salt from driving sea spray conducts very well. A salt contaminated wall will read high even when the water ingress has been stopped and the wall has dried, because the salts draw moisture from the air. Distinguishing salt from moisture needs more than a surface meter, and getting it wrong is how people are sold a damp proof course for a wall whose actual problem is the render outside.'
    },
  ],
  nearby: ['tunbridge-wells', 'guildford']
};
