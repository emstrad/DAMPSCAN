/* Croydon. Housing stock notes are the point of this file: the shared framing
   around them lives in scripts/area-template.js. */
export default {
  slug: 'croydon',
  site: 'ati',
  name: 'Croydon',
  title: 'Damp Surveys in Croydon | ATi Damp Survey',
  metaDescription:
    'Independent damp and timber surveys across Croydon, CR0, CR2, CR7 and SE25. Written reports for owners, buyers, landlords and agents.',
  h1: 'Independent damp surveys in Croydon',
  intro:
    'Croydon is mostly interwar, and that changes the diagnosis completely. A 1930s semi has a cavity wall, a proper slate or bitumen damp proof course and a suspended timber floor over a ventilated void. Damp in a house like that is almost never rising, and treating it as though it were is how people end up paying for injection they did not need.',
  stock: [
    'The classic Croydon house is a bay fronted semi from the twenties or thirties, cavity walled, with airbricks at low level feeding a void under a suspended timber ground floor. Those two features do most of the work in keeping the house dry, and both are routinely defeated. Airbricks get rendered over, buried by a raised patio, or blocked by a new conservatory. Cavities get filled with retrofit insulation that slumps or bridges. Both produce damp at low level on an internal wall face, which looks exactly like rising damp and is not.',
    'Ground levels are the other recurring theme. Sixty or seventy years of successive driveways, patios and block paving have raised the external ground on a great many of these houses above the damp proof course. Once the ground is above the DPC the wall is bridged and the course is irrelevant, however good it is. The fix is a spade and a drainage channel, not a chemical.',
    'The town centre brings a different stock again: post-war blocks, sixties towers and a significant number of recent office to residential conversions. Those conversions were often done under permitted development with limited scope for changing the building envelope, and single aspect flats with mechanical ventilation and large areas of glazing produce persistent condensation that is a design outcome rather than a resident\'s doing.',
  ],
  common: [
    'Damp at low level on a 1930s semi, caused by ground level bridging the damp proof course rather than by rising damp',
    'Blocked or buried airbricks starving the underfloor void, leading to musty ground floors and timber decay',
    'Retrofit cavity wall insulation that has slumped or bridged, showing as damp patches on the exposed elevation',
    'Condensation in an office to residential conversion where the ventilation cannot cope with the layout',
    'Chimney breast staining after a stack was capped without ventilation, in a house full of open fireplaces',
    'Pre purchase surveys on interwar stock where a meter reading has triggered a damp and timber referral',
  ],
  coverage:
    'We cover the borough and the surrounding area, from Croydon town centre out to the Surrey boundary.',
  places: ['Croydon', 'South Croydon', 'Thornton Heath', 'Purley', 'Coulsdon', 'Addiscombe', 'Norbury', 'Selsdon', 'South Norwood'],
  districts: ['CR0', 'CR2', 'CR5', 'CR7', 'CR8', 'SE25'],
  faq: [
    {
      q: 'Can a 1930s house get rising damp?',
      a:
        'It is possible but uncommon, because houses of that age were built with a physical damp proof course that generally still works. What is far more common in Croydon is that the course has been bridged: the drive, patio or garden has been built up above it over the decades, so water crosses the barrier rather than being stopped by it. The symptoms are identical. The remedies are not, and one of them costs a great deal more than the other.'
    },
    {
      q: 'We have had cavity wall insulation. Could that be the cause?',
      a:
        'It can be, and it is worth checking rather than assuming. Retrofit cavity fill can slump over time and leave the top of the wall uninsulated, or bridge the cavity and carry water from the outer leaf to the inner one. The signature is damp patches on the most weather exposed elevation, often at first floor level, appearing after driving rain rather than continuously. We inspect for it directly rather than inferring it, and the report says what we found.'
    },
  ],
  nearby: ['bromley', 'wandsworth']
};
