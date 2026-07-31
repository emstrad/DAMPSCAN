/* Tonbridge and Malling. Housing stock notes are the point of this file: the shared framing
   around them lives in scripts/area-template.js. */
export default {
  slug: 'tonbridge-and-malling',
  site: 'dampscan',
  name: 'Tonbridge and Malling',
  title: 'Damp & Mould Surveys in Tonbridge and Malling | DampScan',
  metaDescription:
    'Damp, mould and timber surveys across Tonbridge and Malling, TN9 to TN12 and ME6, ME18 and ME19.',
  h1: 'Damp and mould surveys in Tonbridge and Malling',
  intro:
    'Tonbridge and Malling straddles the Medway valley and the greensand ridge, taking in a river town, the ragstone quarrying villages around Maidstone\'s western edge, and a good deal of Wealden timber frame. The building materials change every few miles and so does the right way to repair them.',
  stock: [
    'Tonbridge itself sits on the Medway flood plain, and parts of the town have a genuine and documented flood history. Flood affected masonry retains salts that keep meter readings high for years afterwards, and reinstatement carried out in cement and gypsum prevents walls drying between events. Getting the reinstatement right matters more here than almost anywhere else in the county.',
    'The ragstone belt through Aylesford, Ditton and the villages west of Maidstone produces rubble walls of hard stone bound in lime, sometimes with a chalk or softer core. They work by breathing, and cement repointing closes the route by which they release moisture. Sizeable internal treatments get specified for what is a pointing problem on the outside.',
    'Across the Weald end, at Hadlow, Paddock Wood and the villages toward the Sussex boundary, the stock is timber framed, weatherboarded and tile hung, with oast houses converted to housing. Each of those depends on shedding water while letting the structure dry, and each fails when it is sealed with modern impermeable materials or when ground has risen against it.',
  ],
  common: [
    'Flood affected masonry in Tonbridge holding salts that give misleading readings',
    'Reinstatement carried out in cement and gypsum, preventing walls drying between floods',
    'Ragstone rubble walls repointed in cement and unable to release moisture',
    'Timber frame rendered or plastered with impermeable modern materials',
    'Converted oast houses where the wall build up and ventilation were not resolved',
    'Ground and garden levels risen above internal floor level on period cottages',
  ],
  coverage:
    'We cover Tonbridge, West Malling, Snodland and the villages across the Medway valley and the Weald.',
  places: ['Tonbridge', 'West Malling', 'Snodland', 'Aylesford', 'Hadlow', 'Paddock Wood', 'East Peckham', 'Borough Green', 'Kings Hill'],
  districts: ['TN9', 'TN10', 'TN11', 'TN12', 'ME6', 'ME18', 'ME19'],
  faq: [
    {
      q: 'Our house flooded. How should it be put back?',
      a:
        'Breathably and slowly, which is the opposite of the usual instinct. Cement render, gypsum plaster and impermeable paint on a solid or lime built wall stop it drying, so the moisture from the flood stays in the fabric and the next event compounds it. Lime plasters, mineral paints and breathable floor finishes let the wall release what it took in. Drying should be allowed to complete before finishes go back, which takes months rather than weeks. That sequence is the difference between a house that recovers and one that degrades with each flood.'
    },
    {
      q: 'Every wall in our timber framed cottage reads damp. Should we be worried?',
      a:
        'Possibly, but the reading alone does not tell you. Solid and lime built walls hold and release moisture as part of how they function, and meters respond to salts as well as water, so a high number across a whole wall is normal rather than alarming on its own. What matters is whether moisture content in the structural timber is at a level that risks decay, whether the wall is able to dry, and whether something modern is stopping it. That is interpretation rather than measurement.'
    },
  ],
  nearby: ['maidstone', 'tunbridge-wells']
};
