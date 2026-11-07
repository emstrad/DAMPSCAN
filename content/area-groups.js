/**
 * How the area pages are grouped and which ones lead.
 *
 * `groups` is what the areas hub is laid out by, so a reader in Sidcup finds
 * south east London without scanning an alphabetical list of thirty boroughs.
 *
 * `top` is the order the busiest pages are linked in from the home page and the
 * service pages. It follows Search Console impressions (last three months to
 * October 2026): these are the pages Google already shows, sitting at
 * positions 30 to 50, and more internal links is the cheapest lift available.
 * Re-sort it when the data moves; nothing else depends on the order.
 */
import { towns } from './kent-towns.js';

export const areaGroups = {
  /* DampScan is grouped by the towns people search for, with the remaining
     district pages (Medway, Swale, Thanet...) as hubs at the head of their
     group. Towns that share a name with their district (Maidstone, Dover)
     replaced the district page at the same URL. */
  dampscan: {
    groups: [
      { name: 'Dartford and Gravesend', slugs: ['dartford', 'gravesham', 'gravesend', 'swanley'] },
      { name: 'Medway towns', slugs: ['medway', 'chatham', 'gillingham', 'rochester'] },
      { name: 'Maidstone and the Malling towns', slugs: ['maidstone', 'tonbridge-and-malling', 'east-malling', 'west-malling', 'kings-hill', 'aylesford', 'snodland', 'tonbridge'] },
      { name: 'Sevenoaks and the Weald', slugs: ['sevenoaks', 'edenbridge', 'tunbridge-wells'] },
      { name: 'Swale and Canterbury', slugs: ['swale', 'sittingbourne', 'faversham', 'canterbury', 'whitstable', 'herne-bay'] },
      { name: 'Thanet', slugs: ['thanet', 'margate', 'ramsgate', 'broadstairs'] },
      { name: 'Dover, Folkestone and Ashford', slugs: ['dover', 'deal', 'folkestone-and-hythe', 'folkestone', 'hythe', 'ashford'] },
      { name: 'Surrey and Sussex', slugs: ['guildford', 'brighton'] }
    ],
    /* Search Console: "damp proofing" plus these towns carry the impressions
       (Sevenoaks, Sittingbourne, Chatham, Dover, Maidstone, Tunbridge Wells). */
    top: ['sevenoaks', 'maidstone', 'sittingbourne', 'chatham', 'dover', 'tunbridge-wells', 'canterbury', 'tonbridge', 'gravesend', 'ashford', 'margate', 'dartford']
  },
  ati: {
    groups: [
      { name: 'Central London', slugs: ['camden', 'chelsea', 'city-of-london', 'islington', 'kensington-and-chelsea', 'lambeth', 'southwark', 'westminster'] },
      { name: 'North London', slugs: ['barnet', 'enfield', 'haringey'] },
      { name: 'East London', slugs: ['barking-and-dagenham', 'hackney', 'havering', 'newham', 'redbridge', 'romford', 'tower-hamlets', 'waltham-forest'] },
      { name: 'South East London', slugs: ['bexley', 'bromley', 'greenwich', 'lewisham'] },
      { name: 'South West London', slugs: ['croydon', 'kingston-upon-thames', 'merton', 'richmond-upon-thames', 'sutton', 'wandsworth'] },
      { name: 'West London', slugs: ['brent', 'ealing', 'hammersmith-and-fulham', 'harrow', 'hillingdon', 'hounslow'] }
    ],
    top: ['romford', 'chelsea', 'kensington-and-chelsea', 'croydon', 'islington', 'havering', 'hackney', 'bromley', 'barnet', 'camden']
  }
};

/** The top areas for a site, as area or town objects, in priority order.
    Kent towns are looked up as well as the list passed in, because a town
    page is an area page as far as a reader is concerned. */
export function topAreas(site, areas, n = 12) {
  const g = areaGroups[site];
  if (!g) return [];
  const pool = [...areas, ...towns.filter((t) => !areas.includes(t))];
  return g.top
    .map((slug) => pool.find((a) => a.site === site && a.slug === slug))
    .filter(Boolean)
    .slice(0, n);
}
