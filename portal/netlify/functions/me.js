const { getDb } = require('./_lib/db');
const { getSessionUser } = require('./_lib/auth');

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const sessionUser = getSessionUser(event);
    if (!sessionUser) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Not signed in.' }) };
    }

    const sql = getDb();
    const courses = await sql`
        select c.slug, c.title
        from enrollments e
        join courses c on c.id = e.course_id
        where e.user_id = ${sessionUser.id}
        order by c.title
    `;

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: sessionUser.email, courses })
    };
};
