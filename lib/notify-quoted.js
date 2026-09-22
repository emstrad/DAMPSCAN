/**
 * What a change to a quoted job is worth saying out loud.
 *
 * Given the op and the job before and after, returns the notification to send
 * or null when the change is routine. A cost line is routine: it moves the
 * figure but the working screen is where that is read. A job appearing, a
 * job changing state, money arriving and a payout freezing are the moments
 * the owner wants on a phone.
 *
 * Every message obeys the rule in notify.js: business, job number, amounts
 * and staff, never a customer.
 */
const pounds = (pence) => `£${(Number(pence || 0) / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function quotedEvent(op, business, before, after) {
  const name = business.name;
  const job = `Job #${after.id}`;
  if (op === 'save' && !before) {
    return {
      kind: 'job_created', tags: 'clipboard',
      title: `${name}: new job`,
      message: `${job} saved as ${after.status}, ${pounds(after.invoiceNetPence)} net${after.jobDate ? `, for ${after.jobDate}` : ''}.`
    };
  }
  if (op === 'save' && before && before.status !== after.status) {
    return { kind: 'job_status', tags: 'arrows_counterclockwise', title: `${name}: job now ${after.status}`, message: `${job}, ${pounds(after.invoiceNetPence)} net, was ${before.status}.` };
  }
  if (op === 'payment') {
    const m = after.money;
    const last = after.payments[after.payments.length - 1];
    const amount = last ? pounds(last.amountPence) : 'a payment';
    return {
      kind: 'payment', tags: 'moneybag',
      title: `${name}: ${m.paidInFull ? 'paid in full' : 'payment received'}`,
      message: `${amount} on ${job}. ${m.paidInFull ? `${pounds(m.receivedPence)} received of ${pounds(m.invoicePence)}.` : `${pounds(m.outstandingPence)} still to come.`}`
    };
  }
  if (op === 'freeze' && after.frozen) {
    const total = after.frozen.rows.reduce((s, r) => s + r.amountPence, 0);
    const people = after.frozen.rows.length;
    return {
      kind: 'payout_frozen', tags: 'lock',
      title: `${name}: payout frozen`,
      message: `${job}, ${pounds(after.invoiceNetPence)} net. ${pounds(total)} to pay out across ${people} ${people === 1 ? 'person' : 'people'}.`
    };
  }
  if (op === 'unfreeze') {
    return { kind: 'payout_reopened', tags: 'unlock', title: `${name}: payout reopened`, message: `${job} is back on the engine. See the working screen for why.` };
  }
  return null;
}
