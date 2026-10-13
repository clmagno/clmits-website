const bcrypt = require('bcryptjs');
const { getDb } = require('./_lib/db');
const { signSessionCookie } = require('./_lib/auth');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch (err) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
    }

    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    const sql = getDb();
    const [user] = await sql`select id, email, password_hash from users where email = ${email}`;

    // Same error for unknown email and wrong password, so we don't leak which emails are registered.
    const invalid = () => ({ statusCode: 401, body: JSON.stringify({ error: 'Incorrect email or password.' }) });

    if (!user) return invalid();

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return invalid();

    return {
        statusCode: 200,
        multiValueHeaders: { 'Set-Cookie': [signSessionCookie(user)] },
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, email: user.email })
    };
};
