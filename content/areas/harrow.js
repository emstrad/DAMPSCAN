/* Harrow. Housing stock notes are the point of this file: the shared framing
   around them lives in scripts/area-template.js. */
export default {
  slug: 'harrow',
  site: 'ati',
  name: 'Harrow',
  title: 'Damp Surveys in Harrow | ATi Damp Survey',
  metaDescription:
    'Independent damp and timber surveys across Harrow, HA1, HA2, HA3, HA5, HA6 and HA7. Written reports for owners, buyers and landlords.',
  h1: 'Independent damp surveys in Harrow',
  intro:
    'Harrow is Metroland in its purest form: mile after mile of interwar semi built along the railway between the wars, plus a smaller amount of much older building around Harrow on the Hill. It also has a significant number of timber framed houses built in the sixties and seventies, which need treating quite differently from the masonry around them.',
  stock: [
    'The interwar semis are cavity walled with a functioning damp proof course and airbricks feeding a suspended timber ground floor. Damp in these houses is very seldom rising. The dominant cause across the borough is ground level: eighty or ninety years of drives, paths and patios laid over one another until the external ground sits above the damp proof course, so water crosses it. The remedy is excavation and drainage, and it is repeatedly replaced by a chemical injection that cannot address it.',
    'The timber framed housing of the sixties and seventies is the borough\'s under recognised issue. A timber frame relies on a breather membrane, a ventilated cavity and a vapour control layer on the warm side, all working together. Later alterations that penetrate the vapour control layer, or cavity fill injected into a frame cavity that was designed to stay clear, put moisture into structural timber. It is not visible and it is serious.',
    'Around Harrow on the Hill there is older, solid walled and in places timber framed building in a conservation area, needing breathable repairs rather than modern impermeable ones, and needing recommendations that will actually receive consent.',
  ],
  common: [
    'Ground levels raised above the damp proof course after successive drives and patios',
    'Cavity fill injected into a timber frame cavity that was designed to stay clear',
    'Damaged vapour control layers in sixties and seventies timber framed houses',
    'Blocked or buried airbricks and musty suspended ground floors',
    'Slumped retrofit cavity insulation on weather exposed elevations',
    'Breathability problems in older solid walled property around the Hill',
  ],
  coverage:
    'We survey across the borough, from Harrow and Wealdstone out through Pinner and Stanmore to Hatch End and Harrow Weald.',
  places: ['Harrow', 'Pinner', 'Stanmore', 'Wealdstone', 'Hatch End', 'Harrow Weald', 'North Harrow', 'Rayners Lane', 'Kenton'],
  districts: ['HA1', 'HA2', 'HA3', 'HA5', 'HA6', 'HA7'],
  faq: [
    {
      q: 'How do I know if my house is timber framed?',
      a:
        'It is not always obvious, because most are clad in brick and look identical to their masonry neighbours from the street. Age is the first clue, since the bulk of them were built between the mid sixties and the early eighties. Sound, wall thickness at reveals and the behaviour of fixings are further indicators, and drawings or a warranty document will often settle it. It matters because a timber frame handles moisture in a completely different way, and treatments that are harmless on masonry can be damaging on it.'
    },
    {
      q: 'Should a timber framed house have cavity wall insulation?',
      a:
        'Generally not injected fill of the kind used on masonry. The cavity in a timber framed wall is a designed, ventilated drainage gap between the cladding and the breather membrane, and it needs to stay clear so that water getting past the outer skin can drain and dry. Filling it can bridge moisture straight onto the frame. Where a house has been filled, we look for evidence of that having happened rather than assuming either way, and the report says what was found.'
    },
  ],
  nearby: ['brent', 'hillingdon']
};
