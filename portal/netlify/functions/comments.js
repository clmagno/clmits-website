const { getDb } = require('./_lib/db');
const { getSessionUser } = require('./_lib/auth');

// Self-scoped: a learner can only ever read/post to their own thread. No
// userId parameter accepted here -- that's what admin-comments.js is for.
exports.handler = async (event) => {
    const sessionUser = getSessionUser(event);
    if (!sessionUser) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Not signed in.' }) };
    }

    const sql = getDb();

    if (event.httpMethod === 'GET') {
        const comments = await sql`
            select c.id, c.body, c.created_at, c.author_id, u.role as author_role
            from comments c
            join users u on u.id = c.author_id
            where c.user_id = ${sessionUser.id}
            order by c.created_at asc
        `;
        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comments }) };
    }

    if (event.httpMethod === 'POST') {
        let body;
        try {
            body = JSON.parse(event.body || '{}');
        } catch (err) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
        }
        const text = String(body.body || '').trim();
        if (!text) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Message cannot be empty.' }) };
        }
        const [comment] = await sql`
            insert into comments (user_id, author_id, body)
            values (${sessionUser.id}, ${sessionUser.id}, ${text})
            returning id, body, created_at
        `;
        return { statusCode: 201, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment }) };
    }

    return { statusCode: 405, body: 'Method Not Allowed' };
};
