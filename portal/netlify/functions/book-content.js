const { getDb } = require('./_lib/db');
const { getBook } = require('./_lib/bookPricing');

// Public, no-auth -- gated by a random access_token instead of a portal
// login, since book buyers don't need an account. Called cross-origin from
// a book page on clmits.com.
const ALLOWED_ORIGINS = ['https://clmits.com', 'https://www.clmits.com'];

function corsHeaders(event) {
    const origin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
    const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
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

    const qs = event.queryStringParameters || {};
    const token = String(qs.token || '').trim();
    const bookSlug = String(qs.book || '').trim();

    const book = getBook(bookSlug);
    if (!token || !book) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing or invalid request.' }) };
    }

    const sql = getDb();
    const [purchase] = await sql`
        select status from book_purchases where access_token = ${token} and book_slug = ${bookSlug}
    `;
    if (!purchase || purchase.status !== 'paid') {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'We couldn’t verify this purchase. If you just paid, this can take a few seconds — try refreshing. Otherwise contact admin@clmits.com with your receipt.' }) };
    }

    const [content] = await sql`select html_content from book_content where book_slug = ${bookSlug}`;
    if (!content) {
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                pending: true,
                message: `Thanks for purchasing full access to ${book.title}! We're finishing this book's full content and will email it to you directly — usually within 24 hours.`
            })
        };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ html: content.html_content }) };
};
