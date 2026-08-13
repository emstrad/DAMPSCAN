/**
 * ATi's published prices.
 *
 * ATi only. DampScan carries out remedial work, so its survey fee is one line
 * in a larger job and publishing it alone would mislead. Here the survey is the
 * entire transaction, which is exactly why the price can be published: there is
 * no remedial work behind it for the fee to be a loss leader against.
 *
 * The page states that the figure shown is the figure paid, without going into
 * why. If the practice's tax position ever changes so that something does get
 * added to these prices, that line has to change on the same day, because a
 * price that quietly stops being the total is the sort of thing this page
 * exists to argue against.
 */
export const pricing = {
  site: 'ati',
  slug: 'pricing',
  title: 'Damp Survey Prices in London | ATi Damp Survey',
  metaDescription:
    'What an independent damp survey costs in London. Four fixed price bands from £215, what each includes, and what is never added afterwards.',
  h1: 'What a survey costs, and what decides it',
  intro:
    'Most damp surveys in London are free, and that is the problem with them. A free survey is paid for by the work it recommends, which is why so many of them recommend work. We sell no remedial work at all, so the survey is the whole transaction and the price can simply be published.',

  /* Two separate claims, and neither is allowed to overreach. The old wording
     said nothing is ever added and then listed an add on, which is the kind of
     thing this practice exists to stop other people doing. */
  priceLead: 'The price you see is the price you pay.',
  fixedFee: 'The survey fee is agreed in writing before we attend and does not change afterwards, whatever we find. There is one optional extra, an invasive inspection, and it is never carried out unless you agree to it on the day.',

  bands: [
    {
      key: 'localised',
      name: 'Localised damp survey',
      price: '£215',
      fixed: true,
      scope: 'One or two rooms',
      best: 'A specific problem in a specific place: one damp wall, one stained ceiling, one room with mould.',
      note: 'The rest of the property is not inspected, so if the cause turns out to sit elsewhere we will say so and tell you what a wider look would cost. We do not simply widen the survey and bill you for it.'
    },
    {
      key: 'full',
      name: 'Full house survey',
      price: '£295',
      fixed: true,
      scope: 'Up to three bedrooms',
      best: 'Most flats and terraces. A whole property inspected inside and out, whether or not you have spotted a problem in every room.',
      note: 'This is the right choice before a purchase, for a landlord facing a complaint, or when damp has appeared in more than one place and you do not yet know whether they are related.'
    },
    {
      key: 'large',
      name: 'Large property survey',
      price: 'From £375',
      fixed: false,
      scope: 'Four to five bedrooms',
      best: 'Larger houses, which take longer to inspect properly rather than being harder.',
      note: 'The figure moves with the size of the building and how much of it is accessible. We confirm the exact fee in writing before we attend, and it does not move afterwards.'
    },
    {
      key: 'premium',
      name: 'Very large or period property',
      price: 'From £450',
      fixed: false,
      scope: 'Six or more bedrooms, heavily extended, or listed and period',
      best: 'Buildings where the construction itself is the complication: multiple build eras, cellars, lightwells, extensions meeting original fabric.',
      note: 'Quoted individually after we know what the building is. Ask and we will give you a figure, not a range, before you commit to anything.'
    }
  ],

  invasive: {
    name: 'The one optional extra',
    heading: 'Invasive inspection, from £85',
    price: 'From £85',
    body: [
      'Some things cannot be established from the surface. Where the answer depends on what is behind a finish, we form small openings, record what is there and photograph it. Without that, the report has to say the cause is probable rather than established, and probable is worth less to a solicitor, an insurer or a seller.',
      'It is charged separately because it is genuinely optional. Most surveys do not need it. You are not asked to decide in advance and there is no box to tick when booking: we look first, and if opening up would not change the conclusion, we say so and it costs you nothing.',
      'The £85 covers the invasive work on a single survey visit, not each opening, so a survey needing three small openings costs the same as one needing one. It rises only where a property needs an unusual number of them or specialist access, and in that case we give you the figure on site before starting.',
      'Openings are kept as small as the question allows and made good where the finish permits. Where a finish cannot be restored invisibly, tiling and wallpaper being the usual cases, we say so before we open it and you can decide to leave it closed.'
    ]
  },

  included: [
    'A qualified surveyor on site for as long as the property takes, not a fixed appointment slot',
    'Calibrated moisture readings taken to depth, not surface readings from a pin meter',
    'Surface temperature and humidity readings where condensation has to be excluded rather than assumed',
    'External inspection: ground levels, drainage, gutters, pointing, roof junctions and anything else feeding water into the building',
    'A written report within 24 hours of the visit, with photographs and the readings behind every conclusion',
    'A clear statement of what does not need doing, and where a quote you are holding goes beyond the defect',
    'A specification detailed enough for you to obtain competitive quotes, which we will never bid for'
  ],

  notIncluded: [
    {
      h: 'Nothing is added for travel',
      p: 'Anywhere in Greater London, the agreed fee is the fee. Congestion Charge, ULEZ and parking are our problem, not a line on your invoice. Outside the M25 we quote individually or refer you on.'
    },
    {
      h: 'Evenings and weekends cost no more',
      p: 'We work around tenants and working days as a matter of course. There is no out of hours premium.'
    },
    {
      h: 'A second visit, if you need one',
      p: 'If you need us back after works to verify what was done, that is a shorter visit and priced accordingly. It is never assumed or added automatically.'
    }
  ],

  faq: [
    {
      q: 'Why would I pay when other firms survey for free?',
      a: 'Because a free survey is not free, it is a sales visit, and the cost of it sits inside the work that gets recommended afterwards. That arrangement is fine when the diagnosis is obvious and the work is genuinely needed. It stops being fine the moment the honest answer is that little or nothing needs doing, because nobody in that arrangement gets paid for saying so. We carry out no remedial work of any kind, so there is no version of the conclusion that earns us more. The fee is what pays for the opinion.'
    },
    {
      q: 'I have damp in one room of a four bedroom house. Which band?',
      a: 'Start with the localised survey at £215. If the cause is where the damp is, that is the whole job and you have paid the smallest fee that answers the question. If the readings point somewhere else in the building, we will tell you on site what a full survey would cost and you can decide there and then. We would rather sell you the £215 twice than the £375 once for no reason.'
    },
    {
      q: 'What if you find nothing wrong?',
      a: 'The fee is the same, and the report is arguably worth more. Establishing that a property does not have a damp problem is a real finding, and it is the one that saves people the most money, whether that is a purchase that proceeds or a quote that gets refused. You are paying for the inspection and the written conclusion, not for a list of defects.'
    },
    {
      q: 'Can the price change after you arrive?',
      a: 'The survey fee cannot, including if the property turns out to be larger or more awkward than described. The only way your total ends up higher than the band price is if you agree on the day to an invasive inspection, which starts at £85 for the visit. We will only suggest it where opening up would actually change the conclusion, and if it would not we will tell you that instead.'
    },
    {
      q: 'Do you offer a discount for booking online?',
      a: 'Yes. Booking through the form on this site takes 20% off the survey fee. It costs us less to take a booking that way than to work through it on the phone, and the saving is passed on rather than kept.'
    }
  ]
};
