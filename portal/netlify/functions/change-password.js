const bcrypt = require('bcryptjs');
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

    const currentPassword = String(body.currentPassword || '');
    const newPassword = String(body.newPassword || '');

    if (newPassword.length < 8) {
        return { statusCode: 400, body: JSON.stringify({ error: 'New password must be at least 8 characters.' }) };
    }

    const sql = getDb();
    const [user] = await sql`select id, password_hash from users where id = ${sessionUser.id}`;
    if (!user) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Not signed in.' }) };
    }

    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    if (!ok) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Current password is incorrect.' }) };
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await sql`update users set password_hash = ${newHash}, must_change_password = false where id = ${user.id}`;

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
};
