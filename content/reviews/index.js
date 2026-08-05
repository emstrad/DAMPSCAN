/**
 * Real reviews, per site. There are two sites and there will only ever be two,
 * so these are imported by name rather than discovered from the directory.
 */
import dampscan from './dampscan.js';
import ati from './ati.js';

export const reviews = { dampscan, ati };
