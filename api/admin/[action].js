/**
 * Every /api/admin/* route, as one serverless function.
 *
 * Vercel counts one function per file under api/, and a Hobby plan deployment
 * takes twelve. Six separate admin files put the whole deployment over that
 * ceiling on its own. A dynamic route collapses them into one function without
 * changing a single URL: Vercel maps this file to /api/admin/:action, so
 * /api/admin/jobs and /api/admin/leads still answer exactly as they did, and
 * nothing in the staff dashboard had to change.
 *
 * The handlers themselves did not move logic, only location: they live under
 * lib/routes/admin/ now, purely so that Vercel stops treating each one as a
 * function of its own. Each is still a plain (req, res) handler and is still
 * imported directly by the tests, which is where their behaviour is covered.
 * This file is only a lookup.
 */
import { json, requireMethod, actionFrom } from '../../lib/http.js';
import attachment from '../../lib/routes/admin/attachment.js';
import clients from '../../lib/routes/admin/clients.js';
import jobs from '../../lib/routes/admin/jobs.js';
import leads from '../../lib/routes/admin/leads.js';
import rates from '../../lib/routes/admin/rates.js';
import summary from '../../lib/routes/admin/summary.js';

export const config = { runtime: 'nodejs' };

const ROUTES = { attachment, clients, jobs, leads, rates, summary };

export default async function handler(req, res) {
  if (!requireMethod(req, res, ['GET', 'POST', 'DELETE'])) return;

  const route = ROUTES[actionFrom(req.url)];
  if (!route) {
    json(res, 404, { ok: false, error: 'not_found' });
    return;
  }
  return route(req, res);
}
