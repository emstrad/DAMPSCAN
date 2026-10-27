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
import { json, requireMethod, actionFrom, readJson } from '../../lib/http.js';
import { requireScope } from '../../lib/access.js';
import { workOnly, allowedWrite, REFUSED } from '../../lib/work-only.js';
import { withActivity } from '../../lib/activity.js';
import { withFigures } from '../../lib/figures.js';
import scheduling from '../../lib/routes/admin/scheduling.js';
import hours from '../../lib/routes/admin/hours.js';
import conversions from '../../lib/routes/admin/conversions.js';
import quick from '../../lib/routes/admin/quick.js';
import attachment from '../../lib/routes/admin/attachment.js';
import bank from '../../lib/routes/admin/bank.js';
import business from '../../lib/routes/admin/business.js';
import calendar from '../../lib/routes/admin/calendar.js';
import clients from '../../lib/routes/admin/clients.js';
import contracts from '../../lib/routes/admin/contracts.js';
import coolright from '../../lib/routes/admin/coolright.js';
import due from '../../lib/routes/admin/due.js';
import insights from '../../lib/routes/admin/insights.js';
import jobs from '../../lib/routes/admin/jobs.js';
import leads from '../../lib/routes/admin/leads.js';
import mcp from '../../lib/routes/admin/mcp.js';
import me from '../../lib/routes/admin/me.js';
import oauth from '../../lib/routes/admin/oauth.js';
import people from '../../lib/routes/admin/people.js';
import photos from '../../lib/routes/admin/photos.js';
import push from '../../lib/routes/admin/push.js';
import pricebook from '../../lib/routes/admin/pricebook.js';
import quoted from '../../lib/routes/admin/quoted.js';
import rates from '../../lib/routes/admin/rates.js';
import roofing from '../../lib/routes/admin/roofing.js';
import search from '../../lib/routes/admin/search.js';
import snooze from '../../lib/routes/admin/snooze.js';
import surveys from '../../lib/routes/admin/surveys.js';
import summary from '../../lib/routes/admin/summary.js';
import todos from '../../lib/routes/admin/todos.js';
import usage from '../../lib/routes/admin/usage.js';

export const config = { runtime: 'nodejs' };

const ROUTES = { quick, conversions, hours, scheduling, attachment, bank, business, calendar, clients, contracts, coolright, due, insights, jobs, leads, mcp, me, oauth, people, photos, pricebook, push, quoted, rates, roofing, search, snooze, summary, surveys, todos, usage };

export default async function handler(req, res) {
  if (!requireMethod(req, res, ['GET', 'POST', 'DELETE'])) return;

  /* The sign-in addresses an AI assistant looks for (/.well-known/...) are
     rewritten here by middleware.js, but on Vercel the function still sees
     the address that was asked for, not the rewrite. So they are recognised
     by path and sent to the sign-in route with the step it needs. */
  const path = new URL(req.url || '/', 'http://x').pathname;
  if (path.startsWith('/.well-known/oauth-protected-resource')) { req.url = '/api/admin/oauth?step=resource'; return oauth(req, res); }
  if (path.startsWith('/.well-known/oauth-authorization-server') || path === '/.well-known/openid-configuration') {
    req.url = '/api/admin/oauth?step=meta';
    return oauth(req, res);
  }
  const route = ROUTES[actionFrom(req.url)];
  if (!route) {
    json(res, 404, { ok: false, error: 'not_found' });
    return;
  }
  /* A surveyor who only works on a business changes nothing but the survey
     steps (lib/work-only.js), refused here whatever the screen offered. The
     body is read once and left on the request for the route to read again. */
  const action = actionFrom(req.url);
  if (req.method !== 'GET' && !['mcp', 'oauth', 'push', 'usage', 'quick'].includes(action)) {
    const scope = await requireScope(req, res);
    if (!scope) return;
    if (workOnly(scope)) {
      req.body = await readJson(req);
      if (!allowedWrite(action, req.method, req.body)) return json(res, 403, { ok: false, error: 'forbidden', message: REFUSED });
    }
  }
  /* Each change made here is one phone alert, see lib/activity.js. Figures
     are taken out for anyone who only works on a business, lib/figures.js. */
  return withActivity(withFigures(route))(req, res);
}
