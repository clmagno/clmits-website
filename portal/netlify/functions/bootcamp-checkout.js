const { getDb } = require('./_lib/db');
const { createCheckoutSession } = require('./_lib/paymongo');
const { getTier, resolveOffering } = require('./_lib/bootcampPricing');
const { getOfferingSlots } = require('./_lib/slots');

// Called cross-origin from clmits.com (a separate static site/domain), not
// from a portal.clmits.com page -- unlike every other function here, this
// one needs CORS headers and has no session/login requirement at all. It's a
// guest checkout: the bootcamps are live cohorts, not subscription content,
// so there's no portal account to tie the registration to.
const ALLOWED_ORIGINS = ['https://clmits.com', 'https://www.clmits.com'];

function corsHeaders(event) {
    const origin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
    const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

exports.handler = async (event) => {
    const headers = corsHeaders(event);

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch (err) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request.' }) };
    }

    const fullName = String(body.fullName || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const phone = String(body.phone || '').trim();
    const offeringSlug = String(body.offeringSlug || '').trim();
    const tierKey = String(body.tier || '').trim();

    if (!fullName || !email || !offeringSlug || !tierKey) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Please fill in your name and email.' }) };
    }
    if (!EMAIL_RE.test(email)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'That email address doesn’t look right.' }) };
    }

    const sql = getDb();
    const slots = await getOfferingSlots(sql, offeringSlug);

    const tier = getTier(offeringSlug, tierKey, slots);
    if (!tier) {
        const resolved = resolveOffering(offeringSlug, slots);
        const match = resolved && resolved.tiers.find((t) => t.key === tierKey);
        const error = match && match.status === 'sold_out'
            ? 'Sorry — those slots just filled up. Please refresh the page to see what’s still available.'
            : 'That pricing option isn’t available anymore. Please refresh the page and try again.';
        return { statusCode: 409, headers, body: JSON.stringify({ error }) };
    }

    const siteUrl = process.env.SITE_URL || 'https://clmits.com';

    // Only the first installment is charged now (the down payment, or the
    // full amount for a single-payment tier). Anything after that is
    // scheduled in bootcamp_installments and collected later via a
    // separately generated PayMongo link -- see admin-generate-installment-checkout.js.
    const firstInstallment = tier.installments[0];
    const remainingInstallments = tier.installments.slice(1);

    let session;
    try {
        session = await createCheckoutSession({
            amountCentavos: firstInstallment.amountCentavos,
            description: `CLMITS Bootcamp Reservation — ${tier.offeringTitle} (${tier.label}) — ${firstInstallment.label}`,
            successUrl: `${siteUrl}/reserved.html`,
            cancelUrl: `${siteUrl}/index.html#bootcamps`,
            metadata: { offering_slug: offeringSlug, tier: tierKey, email, ...(tier.promo ? { promo: tier.promo.id } : {}) }
        });
    } catch (err) {
        return { statusCode: 502, headers, body: JSON.stringify({ error: err.message || 'Could not start checkout.' }) };
    }

    const [registration] = await sql`
        insert into bootcamp_registrations
            (full_name, email, phone, offering_slug, tier, tier_label, amount_centavos, total_price_centavos, paymongo_checkout_session_id, status)
        values
            (${fullName}, ${email}, ${phone || null}, ${offeringSlug}, ${tierKey}, ${tier.label}, ${firstInstallment.amountCentavos}, ${tier.totalCentavos}, ${session.id}, 'pending')
        returning id
    `;

    for (let i = 0; i < remainingInstallments.length; i++) {
        const installment = remainingInstallments[i];
        await sql`
            insert into bootcamp_installments (registration_id, position, label, amount_centavos, status)
            values (${registration.id}, ${i + 2}, ${installment.label}, ${installment.amountCentavos}, 'scheduled')
        `;
    }

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ checkoutUrl: session.checkoutUrl })
    };
};
