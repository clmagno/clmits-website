const { getDb } = require('./_lib/db');
const { getSessionUser } = require('./_lib/auth');
const { requireRole } = require('./_lib/roles');

// Admin-only -- a private comment thread is as sensitive as the Students
// roster, same stricter gating.
exports.handler = async (event) => {
    const sessionUser = getSessionUser(event);
    const auth = await requireRole(sessionUser, ['admin']);
    if (!auth.ok) {
        return { statusCode: auth.statusCode, body: JSON.stringify({ error: auth.error }) };
    }

    const sql = getDb();

    if (event.httpMethod === 'GET') {
        const userId = (event.queryStringParameters || {}).userId;
        if (!userId) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing userId.' }) };
        }
        const [student] = await sql`select id, full_name, email from users where id = ${userId}`;
        if (!student) {
            return { statusCode: 404, body: JSON.stringify({ error: 'User not found.' }) };
        }
        const comments = await sql`
            select c.id, c.body, c.created_at, c.author_id, u.role as author_role
            from comments c
            join users u on u.id = c.author_id
            where c.user_id = ${userId}
            order by c.created_at asc
        `;
        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ student, comments }) };
    }

    if (event.httpMethod === 'POST') {
        let body;
        try {
            body = JSON.parse(event.body || '{}');
        } catch (err) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
        }
        const userId = String(body.userId || '').trim();
        const text = String(body.body || '').trim();
        if (!userId || !text) {
            return { statusCode: 400, body: JSON.stringify({ error: 'userId and body are required.' }) };
        }
        const [comment] = await sql`
            insert into comments (user_id, author_id, body)
            values (${userId}, ${sessionUser.id}, ${text})
            returning id, body, created_at
        `;
        return { statusCode: 201, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment }) };
    }

    return { statusCode: 405, body: 'Method Not Allowed' };
};
