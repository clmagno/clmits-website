const { getDb } = require('./_lib/db');
const { getSessionUser } = require('./_lib/auth');
const { requireRole } = require('./_lib/roles');
const { createCheckoutSession } = require('./_lib/paymongo');
const { effectiveOffering } = require('./_lib/bootcampPricing');
const { getOfferingSlots } = require('./_lib/slots');
const { getPricingOverride } = require('./_lib/pricingOverrides');
const { paymentReminderEmail } = require('./_lib/emailTemplates');
const { sendMail } = require('./_lib/email');

const POOL_LABELS = { early_bird: 'Early Bird', standard: 'Standard' };

// Admin-only. Follows up a registration whose first payment never went
// through: mints a fresh PayMongo link for the SAME amount they signed up
// under (a promo price they locked in stays honored), and emails it with
// the real slots-left count. The link is also returned so it can be sent
// by SMS/Messenger if email fails or they don't read it.
//
// Refuses when paying would no longer be valid: their tier's deadline has
// passed, or its slot pool is already full.
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const sessionUser = getSessionUser(event);
    const auth = await requireRole(sessionUser, ['admin']);
    if (!auth.ok) {
        return { statusCode: auth.statusCode, body: JSON.stringify({ error: auth.error }) };
    }

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch (err) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request.' }) };
    }

    const registrationId = String(body.registrationId || '').trim();
    if (!registrationId) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing registrationId.' }) };
    }

    const sql = getDb();
    const [reg] = await sql`
        select id, full_name, email, offering_slug, tier, tier_label,
               amount_centavos, total_price_centavos, status
        from bootcamp_registrations
        where id = ${registrationId}
    `;
    if (!reg) {
        return { statusCode: 404, body: JSON.stringify({ error: 'Registration not found.' }) };
    }
    if (reg.status === 'paid') {
        return { statusCode: 409, body: JSON.stringify({ error: 'This registration is already paid.' }) };
    }

    // Someone who abandoned one checkout and then paid through a second one
    // shows up as two rows -- don't chase them over the abandoned one.
    const [alreadyPaid] = await sql`
        select id from bootcamp_registrations
        where email = ${reg.email} and offering_slug = ${reg.offering_slug} and status = 'paid'
        limit 1
    `;
    if (alreadyPaid) {
        return { statusCode: 409, body: JSON.stringify({ error: 'This person already has a paid registration for this offering.' }) };
    }

    const offering = effectiveOffering(reg.offering_slug, await getPricingOverride(sql, reg.offering_slug));
    const tierDef = offering && offering.tiers[reg.tier];
    if (!tierDef) {
        return { statusCode: 400, body: JSON.stringify({ error: 'This registration’s offering/tier no longer exists.' }) };
    }
    if (tierDef.deadline && new Date() > new Date(tierDef.deadline)) {
        return { statusCode: 409, body: JSON.stringify({ error: `${tierDef.label} has closed — they’ll need to re-register at the current rate.` }) };
    }

    const slots = await getOfferingSlots(sql, reg.offering_slug);
    const slotsLeft = slots[tierDef.pool];
    if (slotsLeft != null && slotsLeft <= 0) {
        return { statusCode: 409, body: JSON.stringify({ error: `No ${POOL_LABELS[tierDef.pool]} slots left — reminder not sent.` }) };
    }

    const siteUrl = process.env.SITE_URL || 'https://clmits.com';

    let session;
    try {
        session = await createCheckoutSession({
            amountCentavos: reg.amount_centavos,
            description: `CLMITS Bootcamp Reservation — ${offering.title} (${reg.tier_label})`,
            successUrl: `${siteUrl}/reserved.html`,
            cancelUrl: `${siteUrl}/index.html#bootcamps`,
            metadata: { offering_slug: reg.offering_slug, tier: reg.tier, email: reg.email, registration_id: reg.id }
        });
    } catch (err) {
        return { statusCode: 502, body: JSON.stringify({ error: err.message || 'Could not create a payment link.' }) };
    }

    // Keep the old session id so a payment through the previous link is
    // still matched by the webhook. The status guard covers the webhook
    // marking it paid while this request was in flight.
    const [updated] = await sql`
        update bootcamp_registrations
        set previous_checkout_session_ids = array_append(previous_checkout_session_ids, paymongo_checkout_session_id),
            paymongo_checkout_session_id = ${session.id},
            status = 'pending'
        where id = ${reg.id} and status <> 'paid'
        returning id
    `;
    if (!updated) {
        return { statusCode: 409, body: JSON.stringify({ error: 'This registration was just paid — no reminder needed.' }) };
    }

    let emailSent = false;
    let emailError = null;
    try {
        const { subject, html } = paymentReminderEmail({
            fullName: reg.full_name,
            offeringTitle: offering.title,
            tierLabel: reg.tier_label,
            amountDueCentavos: reg.amount_centavos,
            totalCentavos: reg.total_price_centavos,
            checkoutUrl: session.checkoutUrl,
            slotsLeft,
            poolLabel: POOL_LABELS[tierDef.pool],
            deadline: tierDef.deadline
        });
        await sendMail({ to: reg.email, subject, html });
        emailSent = true;
    } catch (err) {
        console.error('Failed to send payment reminder', err);
        emailError = err.message;
    }

    let reminderCount = null;
    let lastRemindedAt = null;
    if (emailSent) {
        const [row] = await sql`
            update bootcamp_registrations
            set reminder_count = reminder_count + 1, last_reminded_at = now()
            where id = ${reg.id}
            returning reminder_count, last_reminded_at
        `;
        reminderCount = row.reminder_count;
        lastRemindedAt = row.last_reminded_at;
    }

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailSent, emailError, checkoutUrl: session.checkoutUrl, slotsLeft, reminderCount, lastRemindedAt })
    };
};
