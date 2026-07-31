/* Maidstone. Housing stock notes are the point of this file: the shared framing
   around them lives in scripts/area-template.js. */
export default {
  slug: 'maidstone',
  site: 'dampscan',
  name: 'Maidstone',
  title: 'Damp & Mould Surveys in Maidstone | DampScan',
  metaDescription:
    'Damp, mould and timber surveys across Maidstone and the Medway valley, ME14 to ME17. We diagnose the cause before anyone recommends a treatment.',
  h1: 'Damp and mould surveys in Maidstone',
  intro:
    'Maidstone sits in the Medway valley on Kentish ragstone, and both facts show up in the surveys. Ragstone is a beautiful, hard wearing walling stone and a poor barrier to water when the mortar around it fails, and a valley floor town has a high water table in the low lying parts and steep run off in the high ones.',
  stock: [
    'Ragstone walls, common in the older parts of the town and the surrounding villages, are typically rubble filled: two faces of stone with a core of smaller stone and lime mortar between them. They work by staying breathable. Repointed in cement, as many have been, the wall can still take water in through the joints and the face but can no longer let it out, and it moves inwards instead. Sizeable sums get spent on internal treatments here for what is a pointing problem.',
    'The Victorian terraces around the town centre are solid brick with slate roofs and rear closet wings, and the usual pattern is external ground level. Successive resurfacing of yards and passageways has raised the ground against these walls well above the original damp proof course. The town is also low lying along the river, so where the water table is high the two problems compound and are easily mistaken for one.',
    'Out towards the villages, the stock changes again to timber frame, weatherboarding and tile hanging, often listed or in a conservation area. Timber framed buildings need to breathe in a way that modern impermeable repairs prevent. Cement render or gypsum plaster on a timber frame traps moisture directly against the frame, and the decay that follows is structural rather than cosmetic.',
  ],
  common: [
    'Ragstone walls repointed in cement, taking water in and no longer able to release it',
    'Raised yards and passageways bridging the damp proof course on Victorian terraces near the centre',
    'High water table affecting cellars and solid floors in the low lying parts of the valley',
    'Cement render and gypsum plaster trapping moisture against a timber frame in period village property',
    'Blocked or overgrown gullies and drainage on sloping plots above the valley floor',
    'Woodworm and wet rot found in cellars and ground floor timbers during pre purchase surveys',
  ],
  coverage:
    'We cover Maidstone and the villages around it, across the Medway valley and out towards the Weald.',
  places: ['Maidstone', 'Bearsted', 'Boxley', 'Aylesford', 'Loose', 'Coxheath', 'Harrietsham', 'Lenham', 'Marden'],
  districts: ['ME14', 'ME15', 'ME16', 'ME17', 'ME18', 'ME20'],
  faq: [
    {
      q: 'Our ragstone wall is damp inside. Does it need tanking?',
      a:
        'Very rarely, and tanking a solid stone wall usually moves the problem rather than solving it. A rubble filled ragstone wall is designed to take some water and release it again through breathable lime pointing and plaster. If it has been repointed in cement, or rendered externally, the release path is closed and the moisture comes out on the inside face. The remedy is normally to reopen that path with the right mortar and internal finish, which costs a fraction of tanking and does not trap water in the wall core.'
    },
    {
      q: 'We are near the river and the cellar is damp. Is that just the water table?',
      a:
        'It might be, and it is worth proving rather than assuming, because the two look identical from inside. A high water table produces damp that varies with rainfall and river level and is fairly even across the below ground structure. A defect, such as a cracked drain, a bridged wall or surface water running at the building, is more localised and often has a clear direction. We survey both the internal pattern and the external drainage before saying which it is, because the answers cost very different amounts.'
    },
  ],
  nearby: ['medway', 'ashford']
};
