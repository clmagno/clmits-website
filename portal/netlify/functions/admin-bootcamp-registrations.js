const { getDb } = require('./_lib/db');
const { getSessionUser } = require('./_lib/auth');
const { requireRole } = require('./_lib/roles');

// Admin-only -- exposes registrant PII (name, email, phone) and payment data.
exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const sessionUser = getSessionUser(event);
    const auth = await requireRole(sessionUser, ['admin']);
    if (!auth.ok) {
        return { statusCode: auth.statusCode, body: JSON.stringify({ error: auth.error }) };
    }

    const sql = getDb();
    const registrations = await sql`
        select id, full_name, email, phone, offering_slug, tier, tier_label,
               amount_centavos, total_price_centavos, currency, status, created_at, paid_at
        from bootcamp_registrations
        order by created_at desc
    `;

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrations })
    };
};
