/* Barnet. Housing stock notes are the point of this file: the shared framing
   around them lives in scripts/area-template.js. */
export default {
  slug: 'barnet',
  site: 'ati',
  name: 'Barnet',
  title: 'Damp Surveys in Barnet | ATi Damp Survey',
  metaDescription:
    'Independent damp and timber surveys across Barnet, N2, N3, N12, N20, NW4, NW7, EN4 and EN5. Written, evidence-based reports.',
  h1: 'Independent damp surveys in Barnet',
  intro:
    'Barnet is mostly interwar suburb on London clay, with one important exception: Hampstead Garden Suburb, which is an Arts and Crafts conservation area governed by covenants as well as by planning. What can be done to a house there is unusually restricted, and a report that ignores that is not much use.',
  stock: [
    'The Garden Suburb houses are roughcast rendered or brick, built to a designed aesthetic that the Trust and the conservation area exist to preserve. External alterations, replacement windows and anything visible are tightly controlled, and the original roughcast is a lime based, permeable finish. Where it has been patched or overcoated in cement or modern masonry paint, the wall stops drying, and the damp that follows is routinely misattributed. The remedy has to be permeable and it has to be approvable.',
    'The wider borough, through Finchley, Mill Hill, Whetstone and Barnet itself, is cavity walled interwar and post-war semi with a working damp proof course. Ground level is the recurring cause: eighty years of resurfaced drives and patios have raised the external ground above the course on a great many of these houses. The symptom looks exactly like rising damp and the fix is drainage.',
    'The clay subsoil is worth noting because of what it does to drainage runs rather than to walls directly. Clay shrinks and swells seasonally, and mature trees are common across the borough, so displaced or fractured drains under solid floors are more frequent here than in the chalk boroughs. A cracked drain produces persistent, localised damp that responds to nothing done to the wall above it.',
  ],
  common: [
    'Cement patching and modern masonry paint over permeable roughcast render in the Garden Suburb',
    'Ground levels raised above the damp proof course after successive drives and patios',
    'Fractured or displaced drains under solid floors on shrinkable clay',
    'Blocked airbricks and musty suspended timber ground floors',
    'Conservation and covenant restrictions ruling out the external repair proposed',
    'Slumped or bridging retrofit cavity wall insulation on weather exposed elevations',
  ],
  coverage:
    'We survey across the borough, from Golders Green and Hendon up through Finchley and Mill Hill to High Barnet.',
  places: ['Finchley', 'Hendon', 'Mill Hill', 'Golders Green', 'Whetstone', 'Edgware', 'High Barnet', 'Totteridge', 'Hampstead Garden Suburb'],
  districts: ['N2', 'N3', 'N11', 'N12', 'N20', 'NW4', 'NW7', 'EN4', 'EN5'],
  faq: [
    {
      q: 'We are in Hampstead Garden Suburb. Does that change the survey?',
      a:
        'It changes what can be recommended, which is most of the value. The Suburb is both a conservation area and subject to a scheme of management, so external alterations are controlled more tightly than almost anywhere else in outer London. It also means the original render is a permeable finish that has often been overcoated with something that is not. We survey with the constraint in mind and recommend repairs that are both correct for the fabric and capable of being approved.'
    },
    {
      q: 'The damp keeps coming back in one spot on a solid floor. What causes that?',
      a:
        'A persistent, localised damp patch on a ground floor that does not respond to anything done to the walls very often means water below the slab, and on this borough\'s clay the usual reason is a fractured or displaced drain. Clay moves seasonally and mature tree roots find joints. It is worth lifting the manhole covers and checking the runs before anyone specifies a floor treatment, because a treatment over a live leak will simply fail again.'
    },
  ],
  nearby: ['enfield', 'harrow']
};
