/**
 * "What can you do?", answered from the live tool list, so a tool added
 * tomorrow shows up in the guide without anyone editing it. Each tool's
 * heading comes from the small map below; one not in the map goes under
 * Other rather than disappearing.
 *
 * The limits matter as much as the abilities: when somebody asks for a thing
 * no tool does, the assistant says so plainly and offers the nearest thing
 * it can do, instead of pretending or giving up.
 */
import { read } from './shared.js';

export const GUIDE = [
  ['catchup', 'Catch-up and briefings', ['Catch me up', 'Brief me for tomorrow', 'Wrap up the day', 'How did this week go?', 'How many still need to pay in full?', 'Give me the Monday briefing', 'Sweep my inbox', 'What are our competitors doing?', 'Set up the Google Ads paid-job feed for ATi'], 'owner_briefing match_email competitor_watch ads_conversion_setup still_to_pay catch_up brief_me wrap_up_day week_review what_needs_doing due_list due_messages_today'],
  ['bookings', 'Bookings and jobs', ['Book Sarah in BR6 for Thursday at 10', 'Move Mrs Patel to next Monday', 'Hand the Jones job to Tom', 'Who\'s free Thursday?', 'I\'ve just rung Sarah, she wants 2pm', 'Pencil Kim in for Saturday at 10 with Tom', 'Sarah\'s address is 12 High Street, West Malling'], 'create_job create_client find_client update_client get_job book_job move_job update_job_status add_note handover_job who_is_on log_call log_email pencil_in job_done calendar search customer_history'],
  ['surveys', 'Damp surveys (ATi and DampScan)', ['Mark the report sent for BR6 0AA', 'Waiting on the estate agent for Patel', 'Which surveys need reports?', 'Attach this report to Patel', 'Draft the final email for Patel with the report'], 'attach_report get_report_file list_survey_jobs list_client_cards set_awaiting_agent set_estate_agent set_remedial_status mark_report_sent survey_rates'],
  ['roofing', 'Verge Roofing', ['What\'s on the roofing board?', 'Plan next week\'s roofs'], 'roofing_pipeline roofing_week set_roofing_stage update_roofing_plan'],
  ['aircon', 'CoolRight air conditioning', ['Which services are due?', 'Record the commissioning for Ola'], 'coolright_commissioning coolright_service_plan coolright_services_due coolright_unit'],
  ['quotes', 'Quotes and invoices', ['Quote Sarah for a ridge repair and two tiles', 'Send me the quote link', 'Invoice the Jones job'], 'build_quote_from_words add_quote_line remove_quote_line create_quote_from_template use_quote_lines_as_price list_price_book price_book get_quote_link create_invoice get_invoice_link list_quoted_jobs'],
  ['money', 'Money', ['Mark the deposit paid for Patel', 'Match this week\'s bank payments', 'Which jobs are over budget?'], 'mark_deposit_paid mark_paid_in_full match_payment list_unmatched_payments bank add_cost log_time log_miles over_budget_jobs insights insights_summary'],
  ['messages', 'Messages to customers', ['Draft a balance chase for Sarah', 'Give me the review request for Ola', 'Links to send this'], 'get_message mark_message_sent draft_message links_for'],
  ['team', 'To-dos and the team', ['Remind Tom to ring Laura', 'Anything on my list?', 'I\'ve done the Laura call'], 'add_todo list_todos complete_todo reopen_todo people whoami what_can_you_do list_people add_person set_person_access deactivate_person reset_passcode'],
  ['enquiries', 'Website enquiries', ['Any new enquiries?', 'Close the BR6 enquiry, booked elsewhere'], 'list_enquiries find_enquiry close_enquiry reopen_enquiry delete_enquiry'],
  ['website', 'Website and SEO pages', ['Which area pages should we write next?', 'Write up the Jones roof for the website', 'Website stats this month'], 'website_stats pages_to_write set_project_page get_google_post job_photos ratings'],
  ['reports', 'Reports', ['Save this report draft for Patel', 'Get the report draft back'], 'save_report_draft get_report_draft'],
  ['playbook', 'House style (playbook)', ['Remember that we always sign off "Cheers, Scott"', 'What is our tone?'], 'get_playbook save_playbook_note remove_playbook_note'],
  ['contracts', 'Service contracts', ['Which contracts are due this month?'], 'service_contracts']
];

export const LIMITS = [
  ['Send an email, text or WhatsApp itself', 'Gives tap-to-send links (links_for, get_message); or the person\'s own Outlook connector in ChatGPT can send an email.'],
  ['Take a card payment', 'Can mark a deposit or balance paid once the money is in, and match bank payments.'],
  ['Delete an enquiry a job came from', 'Close it instead (close_enquiry), with a reason.'],
  ['Delete a job', 'Move it to cancelled or declined (update_job_status), which keeps the history.'],
  ['Change payout splits, rates or bank settings', 'Owners change those on the staff screens; the assistant can read them.'],
  ['Know about holidays or sick days', 'who_is_on shows booked work only; add a to-do to note absence.'],
  ['Post to Google or social media', 'get_google_post gives the words and photos to post by hand.']
];

/** The guide, grouped, with every tool the server has placed under a heading. */
export function guideFor(tools, { topic } = {}) {
  const home = new Map();
  for (const [key, , , names] of GUIDE) for (const n of names.split(' ')) home.set(n, key);
  const groups = [...GUIDE.map(([key, label, examples]) => ({ key, label, examples, tools: [] })), { key: 'other', label: 'Other', examples: [], tools: [] }];
  for (const t of tools) groups.find((g) => g.key === (home.get(t.name) || 'other')).tools.push({ name: t.name, title: t.title, what: t.description.split('. ')[0].replace(/\.$/, '') });
  const want = String(topic || '').toLowerCase();
  const shown = groups.filter((g) => g.tools.length && (!want || g.key.includes(want) || g.label.toLowerCase().includes(want)));
  return { groups: shown.length ? shown : groups.filter((g) => g.tools.length), limits: LIMITS.map(([cannot, instead]) => ({ cannot, instead })) };
}

async function whatCanYouDo(scope, { topic } = {}) {
  const { TOOLS } = await import('./tools.js');
  return { status: 200, data: { ok: true, ...guideFor(TOOLS, { topic }),
    tip: 'Answer in plain words with a few example phrases per heading. For something in limits, say plainly it cannot, then offer the instead.' } };
}

export const GUIDE_TOOLS = [
  read('what_can_you_do', 'What can you do', 'A plain-English guide to everything this connector can do, grouped (bookings, surveys, roofing, air con, quotes, money, messages, to-dos and team, website pages, reports, catch-up and briefings, playbook) with example phrases, and what it cannot do with the nearest alternative. topic narrows to one group.',
    { topic: { type: 'string' } }, whatCanYouDo)
];
