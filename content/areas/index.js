/**
 * Every area page, in the order they were added.
 *
 * One file per area rather than one big list: each is small enough to read and
 * edit on its own, and adding a town means adding a file rather than finding a
 * place in a thousand line array.
 *
 * `npm run build:areas` turns these into public/areas/<site>/<slug>.html, which
 * middleware.js serves at /damp-survey/<slug> on the matching host.
 */
import islington from './islington.js';
import hackney from './hackney.js';
import wandsworth from './wandsworth.js';
import camden from './camden.js';
import croydon from './croydon.js';
import bromley from './bromley.js';
import ealing from './ealing.js';
import lewisham from './lewisham.js';

import maidstone from './maidstone.js';
import canterbury from './canterbury.js';
import tunbridgeWells from './tunbridge-wells.js';
import ashford from './ashford.js';
import sevenoaks from './sevenoaks.js';
import medway from './medway.js';
import brighton from './brighton.js';
import guildford from './guildford.js';

/** ATi covers London. DampScan covers Kent and the wider South East. */
export const areas = [
  islington, hackney, wandsworth, camden, croydon, bromley, ealing, lewisham,
  maidstone, canterbury, tunbridgeWells, ashford, sevenoaks, medway, brighton, guildford
];
