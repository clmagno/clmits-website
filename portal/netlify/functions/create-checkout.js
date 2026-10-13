const { getDb } = require('./_lib/db');
const { getSessionUser } = require('./_lib/auth');
const { createCheckoutSession } = require('./_lib/paymongo');

// Single monthly price for all subscription-gated courses. Edit this to change pricing.
const PRICE_CENTAVOS = 49900; // PHP 499.00
const PRICE_DESCRIPTION = 'CLMITS Self-Paced Masterclass — Monthly Access';

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const sessionUser = getSessionUser(event);
    if (!sessionUser) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Not signed in.' }) };
    }

    const portalUrl = process.env.PORTAL_URL || 'https://portal.clmits.com';
    const sql = getDb();

    let session;
    try {
        session = await createCheckoutSession({
            amountCentavos: PRICE_CENTAVOS,
            description: PRICE_DESCRIPTION,
            successUrl: `${portalUrl}/billing-success.html`,
            cancelUrl: `${portalUrl}/billing.html`,
            metadata: { user_id: sessionUser.id }
        });
    } catch (err) {
        return { statusCode: 502, body: JSON.stringify({ error: err.message || 'Could not start checkout.' }) };
    }

    await sql`
        insert into payments (user_id, paymongo_checkout_session_id, amount_centavos, status)
        values (${sessionUser.id}, ${session.id}, ${PRICE_CENTAVOS}, 'pending')
    `;

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkoutUrl: session.checkoutUrl })
    };
};
