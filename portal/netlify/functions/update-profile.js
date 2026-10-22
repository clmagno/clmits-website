const { getDb } = require('./_lib/db');
const { getSessionUser } = require('./_lib/auth');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const sessionUser = getSessionUser(event);
    if (!sessionUser) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Not signed in.' }) };
    }

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch (err) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
    }

    const fullName = String(body.fullName || '').trim().replace(/\s+/g, ' ');
    if (fullName.length < 2 || fullName.length > 120) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Enter your full name.' }) };
    }

    const sql = getDb();
    await sql`update users set full_name = ${fullName} where id = ${sessionUser.id}`;

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, fullName }) };
};
