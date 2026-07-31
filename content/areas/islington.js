/* Islington. Housing stock notes are the point of this file: the shared framing
   around them lives in scripts/area-template.js. */
export default {
  slug: 'islington',
  site: 'ati',
  name: 'Islington',
  title: 'Damp Surveys in Islington | ATi Damp Survey',
  metaDescription:
    'Independent damp and timber surveys across Islington, N1, N5, N7, N19 and EC1. We carry out no remedial work, so the report has nothing to sell you.',
  h1: 'Independent damp surveys in Islington',
  intro:
    'Islington is one of the densest concentrations of Georgian and early Victorian terraced housing in the country, and most of it is doing a job it was never designed for: subdivided into flats, with a lower ground floor that was a service basement and is now a bedroom. That single change accounts for a large share of the damp we are asked to look at here.',
  stock: [
    'The typical Islington house is solid brick, one or one and a half bricks thick, with no cavity and no damp proof course worth the name. It was built to breathe: lime mortar, lime plaster, and a floor void that could dry out. A great deal of it has since been repointed in cement, dry lined, or sealed behind gypsum and a plastic membrane. The wall then has nowhere to lose the moisture it takes in, and it appears at the first cold, weak point in the room instead.',
    'The second pattern is the lower ground floor. A front lightwell that was built to keep soil off the wall is now full of decking, a bike store or a raised planter, bridging the wall at or above internal floor level. Rear extensions have often taken the garden level up at the same time. What gets diagnosed as rising damp on a lower ground wall in Islington is very often ground level, a blocked gully or a lightwell drain nobody has lifted in fifteen years.',
    'Conservation area status covers most of the borough, including Barnsbury and Canonbury, which matters practically rather than just administratively. External wall insulation and replacement windows are frequently not an option, so the answer to a cold, mould prone room has to be found in ventilation, heating and internal detailing. A report that recommends work you will never get consent for is no use to anyone.',
  ],
  common: [
    'Mould on the rear corner of a lower ground bedroom, put down to rising damp, caused by a lightwell or raised patio bridging the wall',
    'Salt staining and blown plaster after a well meant cement render was applied to a solid brick wall',
    'Black mould in a converted flat with a shared soil stack and an extract fan ducted into a void rather than outside',
    'Water tracking down from a shared parapet or valley gutter and showing two floors below, on the wrong wall',
    'Timber decay in ground floor joist ends where an airbrick has been rendered over or blocked by a new floor',
    'A pre purchase survey flagging high meter readings on a solid wall, where a meter cannot distinguish salts from moisture',
  ],
  coverage:
    'We survey across the whole borough and the streets immediately around it, north and south of Upper Street.',
  places: ['Angel', 'Highbury', 'Canonbury', 'Barnsbury', 'Archway', 'Finsbury Park', 'Holloway', 'Clerkenwell', 'Tufnell Park'],
  districts: ['N1', 'N4', 'N5', 'N7', 'N19', 'EC1'],
  faq: [
    {
      q: 'Our surveyor said rising damp. Is that likely in an Islington terrace?',
      a:
        'It is possible, but it is diagnosed far more often than it occurs. In a solid brick house with a lower ground floor, the far more common causes are ground level bridging the wall outside, a defective lightwell drain, or a cement render trapping moisture in the wall. All three produce the tide mark and the meter reading that get read as rising damp. That is exactly why we survey before anyone specifies a treatment, and why we do not sell the treatment.'
    },
    {
      q: 'We are in a conservation area. Does that limit what you can recommend?',
      a:
        'It limits what can be done to the outside, not what can be diagnosed. Most of Islington is covered, so external wall insulation, replacement windows and visible external work will often need consent or be refused outright. We write the report knowing that, and concentrate on what can actually be delivered: drainage and ground levels, internal ventilation, breathable finishes, and heating that keeps surfaces above dew point.'
    },
  ],
  nearby: ['hackney', 'camden']
};
