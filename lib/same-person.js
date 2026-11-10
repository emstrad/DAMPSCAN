/**
 * Is this the same customer? One rule for every way a customer arrives (the
 * website form, a half-finished form, a call added on Scheduling, ChatGPT's
 * inbox sweep), so nobody ever has two cards (the owners' choice, 10 Nov
 * 2026). The same person is the same email, or the same phone (spaces and
 * +44 ignored), or, when the details only half match, the same first name at
 * the same postcode. Within one business: ATi and DampScan never mix.
 */
const words = (s) => String(s || '').trim().toLowerCase().split(/\s+/);

export const phoneDigits = (p) => String(p || '').replace(/\D/g, '').replace(/^44/, '0');

/** The values to match on, in the order sameSql expects them. */
export function sameParams({ email, phone, name, postcode }) {
  return [String(email || '').trim().toLowerCase(), phoneDigits(phone), words(name)[0] || '',
    String(postcode || '').replace(/\s+/g, '').toUpperCase()];
}

/** A SQL test for "same person" against these column expressions, params from $p. */
export function sameSql({ email, phone, name, postcode }, p) {
  const d = `regexp_replace(regexp_replace(coalesce(${phone}, ''), '\\D', '', 'g'), '^44', '0')`;
  return `((coalesce(${email}, '') <> '' and lower(${email}) = $${p})
    or (length($${p + 1}) > 6 and ${d} = $${p + 1})
    or ($${p + 2} <> '' and length($${p + 3}) >= 5 and split_part(lower(trim(coalesce(${name}, ''))), ' ', 1) = $${p + 2}
        and upper(replace(coalesce(${postcode}, ''), ' ', '')) = $${p + 3}))`;
}

/** The lead columns, for sameSql on an enquiry. */
export const LEAD = (a) => ({ email: `${a}.email`, phone: `${a}.phone`, name: `${a}.first_name`, postcode: `${a}.postcode` });
/** A job's own details, falling back to its enquiry's. */
export const JOB = (j, l) => ({ email: `coalesce(${j}.customer_email, ${l}.email)`, phone: `coalesce(${j}.customer_phone, ${l}.phone)`,
  name: `coalesce(${j}.customer_name, ${l}.first_name)`, postcode: `coalesce(${j}.customer_postcode, ${l}.postcode)` });

/* Whatever one record has and the other lacks, so a merge never loses a detail. */
export const FILL = `phone = coalesce(nullif(phone, ''), $2), email = coalesce(nullif(email, ''), $3),
  postcode = coalesce(nullif(postcode, ''), $4, postcode), address_line1 = coalesce(nullif(address_line1, ''), $5)`;
