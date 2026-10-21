const bcrypt = require('bcryptjs');
const { getDb } = require('./_lib/db');
const { getSessionUser } = require('./_lib/auth');
const { requireRole } = require('./_lib/roles');
const { generateTempPassword } = require('./_lib/tempPassword');

// Admin-only -- account provisioning (role changes, password resets,
// deletion) is more sensitive than the read-only Students analytics view,
// so this is a separate, stricter surface from admin-users.js.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ['student', 'instructor', 'admin'];

exports.handler = async (event) => {
    const sessionUser = getSessionUser(event);
    const auth = await requireRole(sessionUser, ['admin']);
    if (!auth.ok) {
        return { statusCode: auth.statusCode, body: JSON.stringify({ error: auth.error }) };
    }

    const sql = getDb();
    const qs = event.queryStringParameters || {};

    if (event.httpMethod === 'GET') {
        const users = await sql`
            select id, email, full_name, role, created_at, must_change_password, subscription_until
            from users
            order by created_at desc
        `;
        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ users }) };
    }

    if (event.httpMethod === 'POST') {
        let body;
        try {
            body = JSON.parse(event.body || '{}');
        } catch (err) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
        }

        const email = String(body.email || '').trim().toLowerCase();
        const fullName = String(body.fullName || '').trim();
        const role = String(body.role || 'student').trim();

        if (!EMAIL_RE.test(email) || !fullName || !ROLES.includes(role)) {
            return { statusCode: 400, body: JSON.stringify({ error: 'A valid email, full name, and role are required.' }) };
        }

        const [existing] = await sql`select id from users where email = ${email}`;
        if (existing) {
            return { statusCode: 409, body: JSON.stringify({ error: 'A user with that email already exists.' }) };
        }

        const tempPassword = generateTempPassword();
        const passwordHash = await bcrypt.hash(tempPassword, 10);
        const [created] = await sql`
            insert into users (email, password_hash, full_name, role, must_change_password)
            values (${email}, ${passwordHash}, ${fullName}, ${role}, true)
            returning id
        `;

        return {
            statusCode: 201,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: created.id, tempPassword })
        };
    }

    if (event.httpMethod === 'PATCH') {
        let body;
        try {
            body = JSON.parse(event.body || '{}');
        } catch (err) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
        }

        const id = String(body.id || '').trim();
        const email = String(body.email || '').trim().toLowerCase();
        const fullName = String(body.fullName || '').trim();
        const role = String(body.role || '').trim();
        const resetPassword = Boolean(body.resetPassword);

        if (!id || !EMAIL_RE.test(email) || !fullName || !ROLES.includes(role)) {
            return { statusCode: 400, body: JSON.stringify({ error: 'A valid email, full name, and role are required.' }) };
        }

        const [target] = await sql`select id, role from users where id = ${id}`;
        if (!target) {
            return { statusCode: 404, body: JSON.stringify({ error: 'User not found.' }) };
        }

        const [emailOwner] = await sql`select id from users where email = ${email} and id != ${id}`;
        if (emailOwner) {
            return { statusCode: 409, body: JSON.stringify({ error: 'Another user already has that email.' }) };
        }

        if (target.role === 'admin' && role !== 'admin' && sessionUser.id === id) {
            return { statusCode: 400, body: JSON.stringify({ error: "You can't demote your own account." }) };
        }
        if (target.role === 'admin' && role !== 'admin') {
            const [{ count: adminCount }] = await sql`select count(*)::int as count from users where role = 'admin'`;
            if (adminCount <= 1) {
                return { statusCode: 400, body: JSON.stringify({ error: 'At least one admin account must remain.' }) };
            }
        }

        let tempPassword = null;
        if (resetPassword) {
            tempPassword = generateTempPassword();
            const passwordHash = await bcrypt.hash(tempPassword, 10);
            await sql`update users set password_hash = ${passwordHash}, must_change_password = true where id = ${id}`;
        }

        await sql`update users set email = ${email}, full_name = ${fullName}, role = ${role} where id = ${id}`;

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ok: true, tempPassword })
        };
    }

    if (event.httpMethod === 'DELETE') {
        const id = qs.id;
        if (!id) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing user id.' }) };
        }
        if (id === sessionUser.id) {
            return { statusCode: 400, body: JSON.stringify({ error: "You can't delete your own account." }) };
        }

        const [target] = await sql`select role from users where id = ${id}`;
        if (!target) {
            return { statusCode: 404, body: JSON.stringify({ error: 'User not found.' }) };
        }
        if (target.role === 'admin') {
            const [{ count: adminCount }] = await sql`select count(*)::int as count from users where role = 'admin'`;
            if (adminCount <= 1) {
                return { statusCode: 400, body: JSON.stringify({ error: 'At least one admin account must remain.' }) };
            }
        }

        await sql`delete from users where id = ${id}`;
        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, body: 'Method Not Allowed' };
};
