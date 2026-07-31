/* Sevenoaks. Housing stock notes are the point of this file: the shared framing
   around them lives in scripts/area-template.js. */
export default {
  slug: 'sevenoaks',
  site: 'dampscan',
  name: 'Sevenoaks',
  title: 'Damp & Timber Surveys in Sevenoaks | DampScan',
  metaDescription:
    'Damp, mould and timber surveys across Sevenoaks, TN13 to TN15. Period cottages, weatherboarding and oast houses a speciality.',
  h1: 'Damp and timber surveys in Sevenoaks',
  intro:
    'Sevenoaks and the villages around it hold a lot of period Wealden building: weatherboarded cottages, tile hung elevations, timber frames and converted oast houses. These are the buildings where a modern damp treatment is most likely to do harm, and where the right answer is usually maintenance rather than intervention.',
  stock: [
    'Weatherboarding is a rain screen. It keeps water off the structure behind while allowing air to move, and it depends entirely on being maintained. Boards that have cupped, split at the fixings, or been repainted repeatedly until the laps are sealed will hold water rather than shed it. Where the boarding meets the ground, or a later path or patio has come up to it, the bottom boards and the sole plate behind them are the first casualties, and that sole plate is structural.',
    'Converted oast houses bring a specific set of problems. A roundel was built as an agricultural drying kiln, with a floor designed to let air through and a cowl at the top to draw it. Converting one into habitable rooms means closing all of that up. The wall is often single skin brick, sometimes with no damp proof course at all, and the new insulation and plaster sit directly against it. Damp in a converted oast is nearly always about how the conversion handled ventilation and the wall build up.',
    'The timber framed cottages need the same treatment as elsewhere in the Weald: lime, not cement, and finishes that let the frame dry. Many have been through a phase of cement rendering, and the resulting decay in the frame is what we are usually asked to assess. Ground levels are the other constant, since gardens around these cottages have often risen over a century or more until they sit above the internal floor.',
  ],
  common: [
    'Cupped, split or over painted weatherboarding holding water instead of shedding it',
    'Decay in sole plates and lower timbers where ground or paving has risen against the boarding',
    'Converted oast houses where the wall build up and ventilation were not thought through',
    'Cement render on timber frame, with fungal decay and beetle following',
    'Garden and path levels above internal floor level on period cottages',
    'Woodworm and wet rot in roof timbers and first floors, assessed for whether it is active or historic',
  ],
  coverage:
    'We cover Sevenoaks and the surrounding villages, across west Kent and towards the Surrey boundary.',
  places: ['Sevenoaks', 'Otford', 'Westerham', 'Edenbridge', 'Swanley', 'Kemsing', 'Borough Green', 'Brasted', 'Shoreham'],
  districts: ['TN13', 'TN14', 'TN15', 'TN16', 'BR8'],
  faq: [
    {
      q: 'We have woodworm. Does the whole house need treating?',
      a:
        'Usually not, and blanket treatment is one of the more common overspecifications we are asked to review. The first question is whether the infestation is active or historic, which can be established from the condition of the flight holes, the presence of frass and the moisture content of the timber. Most beetle activity depends on damp timber, so the durable answer is normally to fix why the timber is wet. Treating chemically without doing that deals with the current generation and leaves the conditions for the next.'
    },
    {
      q: 'Is a converted oast house harder to survey?',
      a:
        'It is different rather than harder, and it needs somebody who knows what the building was originally for. The roundel wall is often a single skin of brick built for an unheated agricultural use, and the conversion has generally added insulation and plaster against it. What matters is how that build up handles moisture, what happened to the original ventilation at the floor and the cowl, and whether a damp proof course exists at all. Those are the questions the survey is aimed at, rather than simply reporting that a wall reads damp.'
    },
  ],
  nearby: ['tunbridge-wells', 'maidstone']
};
