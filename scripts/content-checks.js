/**
 * What a content file has to carry before it is allowed to become a page.
 *
 * Split out of build-pages.js when that file outgrew the limit the rest of the
 * project keeps to. Each check returns a list of problems, empty when the
 * file is ready; the build prints every problem it finds and refuses to write
 * anything, because a half built site is worse than an unbuilt one.
 */
import { SITES, distinctiveWordCount } from './area-template.js';
import { distinctiveWordCount as serviceWords } from './service-template.js';
import { distinctiveWordCount as guideWords } from './guide-template.js';

/* A page whose only local content is its name is a doorway page. Google demotes
   those, and it would take the rest of the site down with it, so the build
   fails rather than shipping one. */
const MIN_WORDS = 250;

export function check(area, seen) {
  const problems = [];
  const required = ['slug', 'site', 'name', 'title', 'h1', 'intro', 'coverage'];
  for (const field of required) {
    if (!area[field]) problems.push(`missing ${field}`);
  }
  for (const field of ['stock', 'common', 'places', 'districts', 'faq']) {
    if (!Array.isArray(area[field]) || !area[field].length) problems.push(`${field} is empty`);
  }
  if (!SITES[area.site]) problems.push(`unknown site "${area.site}"`);
  if (area.slug && !/^[a-z0-9-]+$/.test(area.slug)) problems.push('slug must be lower case and hyphenated');

  const key = `${area.site}/${area.slug}`;
  if (seen.has(key)) problems.push('duplicate slug for this site');
  seen.add(key);

  if (!problems.length) {
    const count = distinctiveWordCount(area);
    if (count < MIN_WORDS) {
      problems.push(`only ${count} words of content specific to this area, needs ${MIN_WORDS}`);
    }
  }
  return problems;
}

export function checkService(service, seen) {
  const problems = [];
  for (const field of ['slug', 'site', 'name', 'title', 'h1', 'intro', 'signsHeading', 'ctaHeading', 'ctaBody']) {
    if (!service[field]) problems.push(`missing ${field}`);
  }
  for (const field of ['signs', 'sections', 'faq']) {
    if (!Array.isArray(service[field]) || !service[field].length) problems.push(`${field} is empty`);
  }
  if (!SITES[service.site]) problems.push(`unknown site "${service.site}"`);

  const key = `${service.site}/${service.slug}`;
  if (seen.has(key)) problems.push('duplicate slug for this site');
  seen.add(key);

  if (!problems.length && serviceWords(service) < MIN_WORDS) {
    problems.push(`only ${serviceWords(service)} words written for this service, needs ${MIN_WORDS}`);
  }
  return problems;
}

/* A guide is an article, so it is held to the same floor as a service page:
   a thin one is a doorway page with a date on it. */
export function checkGuide(guide, seen) {
  const problems = [];
  for (const field of ['slug', 'site', 'name', 'title', 'h1', 'intro', 'published']) {
    if (!guide[field]) problems.push(`missing ${field}`);
  }
  for (const field of ['sections', 'faq']) {
    if (!Array.isArray(guide[field]) || !guide[field].length) problems.push(`${field} is empty`);
  }
  if (guide.published && !/^\d{4}-\d{2}-\d{2}$/.test(guide.published)) problems.push('published must be YYYY-MM-DD');
  if (!SITES[guide.site]) problems.push(`unknown site "${guide.site}"`);

  const key = `${guide.site}/${guide.slug}`;
  if (seen.has(key)) problems.push('duplicate slug for this site');
  seen.add(key);

  if (!problems.length && guideWords(guide) < MIN_WORDS) {
    problems.push(`only ${guideWords(guide)} words written for this guide, needs ${MIN_WORDS}`);
  }
  return problems;
}
