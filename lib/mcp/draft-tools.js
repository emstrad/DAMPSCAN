/**
 * Words for the assistant to write with: the house style (the playbook),
 * a report draft kept on the job, and everything needed to draft a message
 * to a customer, with the tap-to-send links for whatever it settles on.
 *
 * The assistant writes the words; these tools only hold and hand back. The
 * playbook is shared, so whatever Scott's ChatGPT learns about how the
 * business talks, Tom's reads too.
 */
import { query, queryOne } from '../db.js';
import { record } from '../audit.js';
import { present } from '../quoted.js';
import { forViewer } from '../profit.js';
import { linksFor } from '../messages.js';
import { customer, firstName, money, brandName } from '../alert-words.js';
import { read, write, fail, notFound, jobInScope, canManage, trimJob, ID, SITE } from './shared.js';

const ok = (data) => ({ status: 200, data: { ok: true, ...data } });
export const SECTIONS = ['tone', 'email templates', 'policies', 'prices', 'standard replies', 'other'];
const MAX = 8000;

async function saveDraft(scope, { id, text }) {
  const found = await jobInScope(scope, id);
  if (!found) return notFound();
  const words = String(text || '').slice(0, 20000);
  await query('update jobs set report_draft = $2, updated_at = now() where id = $1', [found.job.id, words || null]);
  const c = customer(found.job.customer_name, found.job.customer_postcode);
  await record({ scope, business: found.job.site, entity: 'job', entityId: found.job.id, action: 'report_draft', after: { said: `saved a report draft for ${c}`, group: 'reports', customer: c } });
  return ok({ said: `Report draft for ${c} saved (${words.length} characters).` });
}

async function getDraft(scope, { id }) {
  const found = await jobInScope(scope, id);
  if (!found) return notFound();
  return ok({ customer: customer(found.job.customer_name, found.job.customer_postcode), draft: found.job.report_draft || null });
}

async function playbookFor(scope, site) {
  const sites = site ? [site] : scope.businesses;
  return query(`select id, business_slug, section, text, added_by, created_at from playbook_notes
      where business_slug is null or business_slug = any($1::text[]) order by section, created_at`, [sites]);
}

async function getPlaybook(scope, { business }) {
  if (business && !scope.businesses.includes(business)) return fail('That business is not one you hold.');
  const rows = await playbookFor(scope, business);
  const sections = {};
  for (const r of rows) (sections[r.section] ||= []).push({ id: Number(r.id), business: r.business_slug ? brandName(r.business_slug) : 'All', text: r.text, addedBy: r.added_by });
  return ok({ sections, count: rows.length, tip: rows.length ? 'Write in this style. Business-specific notes win over "All".' : 'Nothing saved yet. When the person says how they like things done, offer to save it.' });
}

async function saveNote(scope, { section, text, business }) {
  const words = String(text || '').trim().slice(0, MAX);
  if (!words) return fail('Say what to remember.');
  if (business && !scope.businesses.includes(business)) return fail('That business is not one you hold.');
  const sec = SECTIONS.includes(String(section || '').toLowerCase()) ? String(section).toLowerCase() : 'other';
  const row = await queryOne('insert into playbook_notes (business_slug, section, text, added_by) values ($1, $2, $3, $4) returning id', [business || null, sec, words, scope.name || 'The owners']);
  await record({ scope, business: business || null, entity: 'playbook', entityId: row.id, action: 'add', after: { section: sec, text: words } });
  return ok({ id: Number(row.id), said: `Saved to the playbook under ${sec}${business ? ` for ${brandName(business)}` : ''}.` });
}

async function removeNote(scope, { id }) {
  const row = await queryOne('select * from playbook_notes where id = $1', [id]);
  if (!row || (row.business_slug && !scope.businesses.includes(row.business_slug))) return fail('No such playbook note.');
  if (!row.business_slug && !scope.isAdmin && !Object.values(scope.levels || {}).includes('manage')) return fail('Only a manager can remove a note for every business.');
  await query('delete from playbook_notes where id = $1', [id]);
  await record({ scope, business: row.business_slug, entity: 'playbook', entityId: id, action: 'remove', before: { section: row.section, text: row.text } });
  return ok({ said: 'Removed from the playbook.' });
}

/* Which ready-made message, if any, fits what the person wants to say. */
const PURPOSES = { 'chase balance': ['invoice', 'reminder'], 'confirm booking': [], 'deposit request': [], 'report ready': [], 'review request': ['rating', 'review'], 'quote follow up': ['followup', 'quote'], other: [] };

async function draftMessage(scope, { id, purpose }) {
  const found = await jobInScope(scope, id);
  if (!found) return notFound();
  const j = found.job;
  const manage = canManage(scope, j.site);
  const context = { business: found.business.name, firstName: firstName(j.customer_name), postcode: j.customer_postcode, date: j.job_date, time: j.job_time ? String(j.job_time).slice(0, 5) : null, status: j.status };
  let ready = null;
  if (found.business.payout_model === 'damp') {
    Object.assign(context, { depositPaid: Boolean(j.deposit_paid_at), paidInFull: Boolean(j.paid_at), reportSent: Boolean(j.survey_sent_at || j.report_ready_at), ...(manage ? { price: money(j.survey_price_pence) } : {}) });
  } else {
    const p = trimJob(forViewer(await present(j, found.business), scope), scope);
    Object.assign(context, { quoteUrl: p.quote.url || null, invoiceUrl: p.quote.invoice ? p.quote.invoice.url : null, invoiceNumber: p.quote.invoice ? p.quote.invoice.number : null,
      ...(manage ? { invoice: money(p.money.invoicePence), received: money(p.money.receivedPence), owed: money(p.money.outstandingPence) } : {}) });
    const kinds = PURPOSES[String(purpose || '').toLowerCase()] || [];
    const kind = kinds.find((k) => p.messages.ready && p.messages.ready[k]);
    if (kind) ready = { kind, subject: p.messages.ready[kind].subject, text: p.messages.ready[kind].text, links: p.messages.ready[kind].links };
  }
  const style = (await playbookFor(scope, j.site)).map((r) => ({ section: r.section, text: r.text }));
  return ok({ purpose: purpose || 'other', context, ready, playbook: style,
    tip: ready ? 'There is a ready message for this; adjust it to the playbook if needed, then call links_for with the final words.' : 'Write it in the playbook style, show it, then call links_for with the final words.' });
}

async function linksForJob(scope, { id, text, subject }) {
  const found = await jobInScope(scope, id);
  if (!found) return notFound();
  if (!String(text || '').trim()) return fail('Give the words to send.');
  let { customer_phone: phone, customer_email: email } = found.job;
  if ((!phone || !email) && found.job.lead_id) {
    const l = await queryOne('select phone, email from leads where id = $1', [found.job.lead_id]);
    phone = phone || (l && l.phone); email = email || (l && l.email);
  }
  const links = linksFor({ text: String(text), subject: subject || found.business.name }, phone, email);
  /* site and jobId say whose job it is, so lib/figures.js keeps the links for its own surveyor or crew. */
  return ok({ site: found.job.site, jobId: Number(found.job.id), links, tip: 'Show these to tap. Nothing is sent until the person taps one. Then mark_message_sent if it was one of the standard messages.' });
}

export const DRAFT_TOOLS = [
  write('save_report_draft', 'Save report draft', 'Keeps a report draft on the job, replacing any earlier draft. You write the wording; this only stores it.', { id: ID, text: { type: 'string' } }, ['id', 'text'], saveDraft, { idempotent: true }),
  read('get_report_draft', 'Report draft', 'The report draft saved on a job, if any.', { id: ID }, getDraft),
  read('get_playbook', 'Playbook', 'The shared house style: tone, email templates, policies, prices, standard replies. Call before drafting anything for a customer and write in that style.', { business: SITE }, getPlaybook),
  write('save_playbook_note', 'Remember for the playbook', 'Saves a house-style note everyone\'s assistant will follow ("we always...", a template, a policy). section: tone, email templates, policies, prices, standard replies or other. Leave business out when it is for every business.',
    { section: { type: 'string', enum: SECTIONS }, text: { type: 'string' }, business: SITE }, ['section', 'text'], saveNote),
  write('remove_playbook_note', 'Forget a playbook note', 'Removes one playbook note by its id from get_playbook.', { id: { type: 'integer' } }, ['id'], removeNote, { idempotent: true }),
  read('draft_message', 'Draft a message', 'Everything needed to write a message to a customer: first name, dates, amounts (managers only), quote, invoice and rating links, the ready-made message if one fits, and the playbook. purpose: chase balance, confirm booking, deposit request, report ready, review request, quote follow up or other.',
    { id: ID, purpose: { type: 'string' } }, draftMessage),
  read('links_for', 'Send links', 'WhatsApp, text and email links that open with the given words to this customer, to tap. Sends nothing itself.', { id: ID, text: { type: 'string' }, subject: { type: 'string' } }, linksForJob)
];
