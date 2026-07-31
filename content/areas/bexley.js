/* Bexley. Housing stock notes are the point of this file: the shared framing
   around them lives in scripts/area-template.js. */
export default {
  slug: 'bexley',
  site: 'ati',
  name: 'Bexley',
  title: 'Damp Surveys in Bexley | ATi Damp Survey',
  metaDescription:
    'Independent damp and timber surveys across Bexley, DA1, DA5 to DA8 and DA14 to DA16. Written reports for owners, buyers and landlords.',
  h1: 'Independent damp surveys in Bexley',
  intro:
    'Bexley is chalk and gravel on the higher ground and river marsh at Erith and Crayford, with interwar and post-war suburb covering nearly all of it. The geology is the useful thing to know here: chalk drains fast, so damp arrives quickly during rainfall and goes again, which gives it a distinctly episodic character.',
  stock: [
    'On the chalk, water moves through the ground quickly rather than accumulating. Damp that appears during heavy rain and eases within days is normally surface and near surface water reaching the building, not a rising problem, and the answer lies in ground falls, gullies and drainage rather than in anything applied to the wall. It is one of the clearest diagnostic patterns available and it is regularly ignored.',
    'The interwar and post-war semis that make up most of the borough are cavity walled with working damp proof courses and airbricks under suspended timber floors. As everywhere in that stock, the dominant fault is external ground built up over decades until it bridges the course, and the second is airbricks blocked by patios, conservatories or render. Neither needs a chemical.',
    'At Erith, Crayford and the marsh edge the ground is low and alluvial and the water table is high, so solid floors and any below ground space behave quite differently from the same house half a mile uphill. Older riverside industrial housing there also brings solid walls and, in places, no effective damp proof course at all.',
  ],
  common: [
    'Episodic damp on chalk after heavy rain, pointing at surface water rather than rising damp',
    'Ground levels built up above the damp proof course on interwar and post-war semis',
    'Airbricks blocked by patios, conservatories or render, starving the underfloor void',
    'High water table affecting solid floors and below ground space at the marsh edge',
    'Older riverside housing with solid walls and no effective damp proof course',
    'Slumped or bridging retrofit cavity insulation on exposed elevations',
  ],
  coverage:
    'We survey across the borough, from Bexleyheath and Sidcup out through Crayford to Erith and the riverside.',
  places: ['Bexleyheath', 'Sidcup', 'Erith', 'Crayford', 'Welling', 'Barnehurst', 'Belvedere', 'Blackfen', 'Slade Green'],
  districts: ['DA1', 'DA5', 'DA6', 'DA7', 'DA8', 'DA14', 'DA15', 'DA16'],
  faq: [
    {
      q: 'The damp comes and goes with the weather. What does that rule out?',
      a:
        'It largely rules out rising damp, which is a slow, steady process that does not switch on and off with rainfall. Damp that tracks the weather is arriving from outside: surface water reaching the wall, an overflowing gutter or hopper, driving rain on an exposed elevation, or ground water moving quickly through chalk. That pattern is genuinely useful evidence, so it is worth telling us when it happens and what the weather was doing.'
    },
    {
      q: 'Two houses in the same street, one damp and one not. How?',
      a:
        'Usually because something has been done to one of them and not the other. Ground level is the most common: one house has had three layers of drive laid over eighty years and the other has not. Blocked airbricks, a rear extension, a conservatory across a wall, or retrofit cavity fill in one and not the other will all do it. Identical houses do not have identical histories, and the history is generally where the answer is.'
    },
  ],
  nearby: ['greenwich', 'havering']
};
