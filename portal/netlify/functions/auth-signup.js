const bcrypt = require('bcryptjs');
const { getDb } = require('./_lib/db');
const { signSessionCookie } = require('./_lib/auth');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Bot signups (gibberish names, dotted Gmail addresses) were landing in the
// users table. Two cheap checks, invisible to people:
//   - `website` is a honeypot field hidden off-screen in signup.html; form-
//     filling bots fill it in. They get a fake success so they don't retry.
//   - `elapsedMs` is how long the form was open (measured client-side, so
//     clock skew doesn't matter). Bots submit instantly or POST straight to
//     this endpoint without it.
const MIN_FORM_MS = 2500;

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

    if (String(body.website || '').trim()) {
        console.log('Signup honeypot tripped:', String(body.email || '').slice(0, 120));
        return { statusCode: 201, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
    }
    const elapsedMs = Number(body.elapsedMs);
    if (!Number.isFinite(elapsedMs) || elapsedMs < MIN_FORM_MS) {
        console.log('Signup rejected as too fast:', body.elapsedMs, String(body.email || '').slice(0, 120));
        return { statusCode: 400, body: JSON.stringify({ error: 'Please take a moment to check your details, then try again.' }) };
    }

    const fullName = String(body.fullName || '').trim().replace(/\s+/g, ' ');
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (fullName.length < 2 || fullName.length > 120) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Enter your full name.' }) };
    }
    if (!EMAIL_RE.test(email)) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Enter a valid email address.' }) };
    }
    if (password.length < 8) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Password must be at least 8 characters.' }) };
    }

    const sql = getDb();

    const existing = await sql`select id from users where email = ${email}`;
    if (existing.length > 0) {
        return { statusCode: 409, body: JSON.stringify({ error: 'An account with that email already exists.' }) };
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [user] = await sql`
        insert into users (email, password_hash, full_name)
        values (${email}, ${passwordHash}, ${fullName})
        returning id, email
    `;

    // Signing up is free and just creates the account -- it unlocks the Module 1
    // free preview on any course, but full access requires an active subscription
    // (see create-checkout.js / paymongo-webhook.js).

    return {
        statusCode: 201,
        multiValueHeaders: { 'Set-Cookie': [signSessionCookie(user)] },
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, email: user.email })
    };
};
