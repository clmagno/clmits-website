const { getDb } = require('./_lib/db');
const { getSessionUser } = require('./_lib/auth');
const { requireRole } = require('./_lib/roles');
const { createCheckoutSession } = require('./_lib/paymongo');

// Admin-only. Bootcamp installment plans aren't auto-billed (GCash can't be
// silently charged), so when a scheduled payment comes due, an admin calls
// this to mint a PayMongo link for that specific amount and sends it to the
// student manually (Messenger/email). Safe to call again on an already
// 'pending' installment -- it just issues a fresh link.
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

    const installmentId = String(body.installmentId || '').trim();
    if (!installmentId) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing installmentId.' }) };
    }

    const sql = getDb();
    const [installment] = await sql`
        select bi.id, bi.label, bi.amount_centavos, bi.status,
               r.full_name, r.email, r.tier_label
        from bootcamp_installments bi
        join bootcamp_registrations r on r.id = bi.registration_id
        where bi.id = ${installmentId}
    `;

    if (!installment) {
        return { statusCode: 404, body: JSON.stringify({ error: 'Installment not found.' }) };
    }
    if (installment.status === 'paid') {
        return { statusCode: 400, body: JSON.stringify({ error: 'This installment is already paid.' }) };
    }

    const siteUrl = process.env.SITE_URL || 'https://clmits.com';

    let session;
    try {
        session = await createCheckoutSession({
            amountCentavos: installment.amount_centavos,
            description: `CLMITS Bootcamp Installment — ${installment.tier_label} — ${installment.label}`,
            successUrl: `${siteUrl}/reserved.html`,
            cancelUrl: `${siteUrl}/index.html#bootcamps`,
            metadata: { installment_id: installment.id, email: installment.email }
        });
    } catch (err) {
        return { statusCode: 502, body: JSON.stringify({ error: err.message || 'Could not start checkout.' }) };
    }

    await sql`
        update bootcamp_installments
        set paymongo_checkout_session_id = ${session.id}, status = 'pending'
        where id = ${installmentId}
    `;

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkoutUrl: session.checkoutUrl })
    };
};
