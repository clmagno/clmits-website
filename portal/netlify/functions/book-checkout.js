const crypto = require('crypto');
const { getDb } = require('./_lib/db');
const { createCheckoutSession } = require('./_lib/paymongo');
const { getBook } = require('./_lib/bookPricing');

// Called cross-origin from clmits.com (a separate static site), guest
// checkout with no portal account -- same shape as bootcamp-checkout.js.
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
    const bookSlug = String(body.bookSlug || '').trim();

    if (!fullName || !email) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Please fill in your name and email.' }) };
    }
    if (!EMAIL_RE.test(email)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'That email address doesn’t look right.' }) };
    }

    const book = getBook(bookSlug);
    if (!book) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'That book isn’t available.' }) };
    }

    const siteUrl = process.env.SITE_URL || 'https://clmits.com';
    const accessToken = crypto.randomBytes(24).toString('hex');
    const sql = getDb();

    let session;
    try {
        session = await createCheckoutSession({
            amountCentavos: book.priceCentavos,
            description: `CLMITS Book — ${book.title} (Full Access)`,
            successUrl: `${siteUrl}/books/${book.file}?unlock=${accessToken}`,
            cancelUrl: `${siteUrl}/index.html#books`,
            metadata: { book_slug: bookSlug, email }
        });
    } catch (err) {
        return { statusCode: 502, headers, body: JSON.stringify({ error: err.message || 'Could not start checkout.' }) };
    }

    await sql`
        insert into book_purchases (full_name, email, book_slug, amount_centavos, paymongo_checkout_session_id, access_token, status)
        values (${fullName}, ${email}, ${bookSlug}, ${book.priceCentavos}, ${session.id}, ${accessToken}, 'pending')
    `;

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ checkoutUrl: session.checkoutUrl })
    };
};
