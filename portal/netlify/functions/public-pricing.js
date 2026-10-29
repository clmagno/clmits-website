const { getDb } = require('./_lib/db');
const { OFFERINGS, resolveOffering } = require('./_lib/bootcampPricing');
const { getOfferingSlots } = require('./_lib/slots');
const { getEarlyBirdOverrides } = require('./_lib/pricingOverrides');

// Public, no-auth endpoint -- called cross-origin from clmits.com, same CORS
// pattern as public-cohorts.js. Returns live bootcamp pricing (with any
// active promo applied) and slots left, so the site never hard-codes prices.
// Never returns attendee data.
const ALLOWED_ORIGINS = ['https://clmits.com', 'https://www.clmits.com'];

function corsHeaders(event) {
    const origin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
    const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
    };
}

exports.handler = async (event) => {
    const headers = corsHeaders(event);

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const sql = getDb();
    const offerings = {};
    const earlyBirdOverrides = await getEarlyBirdOverrides(sql);
    for (const slug of Object.keys(OFFERINGS)) {
        const slots = await getOfferingSlots(sql, slug);
        const resolved = resolveOffering(slug, slots, earlyBirdOverrides[slug]);
        offerings[slug] = {
            title: resolved.title,
            slotsLeft: { early_bird: slots.early_bird, standard: slots.standard },
            tiers: resolved.tiers.map((t) => ({
                key: t.key,
                label: t.label,
                note: t.note,
                pool: t.pool,
                deadline: t.deadline,
                totalCentavos: t.totalCentavos,
                dueTodayCentavos: t.dueTodayCentavos,
                installmentCount: t.installments.length,
                promo: t.promo,
                status: t.status
            }))
        };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ now: new Date().toISOString(), offerings }) };
};
