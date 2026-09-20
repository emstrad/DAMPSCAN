/* What air conditioning installation costs, CoolRight.
 *
 * The original of this page was written in the standalone repo with its price
 * ranges left null, and that build refuses to publish it until they are filled
 * in. That refusal is right and the page stayed unpublished, which is a poor
 * outcome for the highest intent search in the trade.
 *
 * So it is rewritten the way the roofing guides are: it publishes the basis
 * rather than a figure. What moves the price, what should be named in a quote,
 * what absence from a quote tells you, and how to compare two of them. That is
 * answerable today, honestly, by a business still settling what it pays an
 * installer, and it commits to nothing that would have to be retracted.
 *
 * When there are twenty installs behind the business and ranges it will always
 * honour, add them. Until then a page that teaches somebody to read a quote is
 * worth more than a range that gets corrected upwards on the visit.
 */
export default {
  slug: 'air-conditioning-installation-cost',
  site: 'ac',
  name: 'What air conditioning installation costs',
  title: 'Air Conditioning Installation Cost: What Moves the Price | CoolRight',
  metaDescription:
    'What actually drives the cost of installing air conditioning, what a quote should name, and how to compare two quotes that look different. Written to be read before you commit.',
  h1: 'What air conditioning installation costs, and what moves it',
  published: '2026-09-20',
  intro:
    'This page does not give you a number, and it is worth saying why at the top. A figure quoted before anybody has seen the room is a guess, and guesses in this trade are corrected upwards on the visit. What is worth knowing beforehand is what moves the price, because that is what lets you read two quotes that look nothing alike and work out which one is describing your house.',
  sections: [
    {
      h2: 'What actually decides the figure',
      paras: [
        'Five things, roughly in the order they matter. The heat load of the room, which is not its floor area: a south-facing room with large glazing and a flat roof above it gains far more than a north-facing room of the same size, and wants a bigger unit. The distance between the indoor unit and wherever the condenser can legally and sensibly go, because pipe, cable and labour all scale with it. What the condenser has to be fixed to, and whether reaching it needs scaffold, a lift or a roof anchor.',
        'Then the equipment itself, where the spread is genuinely wide and mostly justified: inverter efficiency, minimum operating temperature, sound level at the outdoor unit and the length of the warranty are the things that separate two units of the same nominal output. And finally the making good, which is the line most often missing from the cheaper of two quotes.'
      ]
    },
    {
      h2: 'What a quote should name',
      paras: [
        'A quote you can actually compare names the equipment by manufacturer and model rather than by capacity alone, because "2.5kW split" describes a dozen units at three different prices. It states the pipe run length it is priced on, since that is the assumption most likely to change on the day. It says where the condensate goes and how it gets there, which is the single most common cause of a system damaging a house two summers later.',
        'It should also say who registers the warranty and who holds the F-Gas records, and it should include the commissioning: pressure test, evacuation, charge and measured performance. A system that was never properly evacuated will work for a while and then not.'
      ],
      list: [
        'Equipment named by make and model, not just capacity',
        'The pipe run length the price assumes',
        'Condensate route and fall, stated rather than decided on the day',
        'Pressure test, evacuation and commissioning included',
        'Making good, waste and VAT in the figure',
        'Who registers the warranty, and who keeps the F-Gas record'
      ]
    },
    {
      h2: 'Why one quote is cheaper than another',
      paras: [
        'Usually for one of four reasons, and only one of them is good. The unit is a cheaper make with a shorter warranty and a louder condenser. The pipe run is priced short and will be re-quoted once the installer sees it. The making good is excluded, so the hole, the trunking and the plaster come back as extras. Or the commissioning is being skipped, which nobody can see and which decides how long the system lasts.',
        'The good reason is that the installer has found a shorter or simpler route than the other quote assumed, and has said so. That is worth asking about directly, because a genuinely better design is worth paying for and is easy to confirm.'
      ]
    },
    {
      h2: 'What cooling does not fix, at any price',
      paras: [
        'Condensation is the big one. It is a moisture and ventilation problem, and cooling a surface can make it worse rather than better. Every summer somebody asks us to quote for air conditioning to cure damp on a bedroom wall, and the honest answer is ventilation, which usually costs less.',
        'The other is an overheating problem caused by glazing and the fabric of the building. Cooling will win that fight, and it will win it by running constantly and costing money to do so. Shading, ventilation and, where it is possible, doing something about the glazing are worth pricing alongside the cooling rather than after it.'
      ]
    }
  ],
  faq: [
    {
      q: 'Why will you not publish a price?',
      a: 'Because a figure given before anybody has seen the room is a guess, and it is always a guess that gets corrected upwards. The visit is free and the written quote that follows is fixed, which is a more useful promise than a range.'
    },
    {
      q: 'What is the cheapest way to cool one room?',
      a: 'A single wall-mounted split, with the condenser close to the indoor unit and an easy route between them. Every metre of pipe, every floor of height and every awkward fixing adds, so the room that is simplest to reach is the cheapest to do.'
    },
    {
      q: 'Is a more expensive unit worth it?',
      a: 'Often, and not always. Efficiency shows up on every bill for fifteen years, and sound level shows up on your neighbour’s patio. Beyond that the premium is frequently features you will not use, and we will say which is which.'
    },
    {
      q: 'Does the price include running it?',
      a: 'No, and it is worth asking what it will cost. A correctly sized inverter system on a modern tariff is cheaper to run than most people expect, and an oversized one short-cycles and costs more. Sizing is a running cost decision as much as a comfort one.'
    }
  ],
  related: ['air-conditioning-installation', 'multi-split-systems', 'ventilation-and-mvhr']
};
