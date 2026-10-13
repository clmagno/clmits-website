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
        select
            c.slug,
            c.title,
            c.description,
            count(m.id)::int as total_modules,
            count(mp.module_id)::int as completed_modules
        from enrollments e
        join courses c on c.id = e.course_id
        left join modules m on m.course_id = c.id
        left join module_progress mp on mp.module_id = m.id and mp.user_id = e.user_id
        where e.user_id = ${sessionUser.id}
        group by c.slug, c.title, c.description
        order by c.title
    `;

    const offerings = await sql`
        select c.slug, c.title, c.description, c.inquiry_interest
        from courses c
        where c.is_catalog_only = true
        and not exists (
            select 1 from enrollments e where e.user_id = ${sessionUser.id} and e.course_id = c.id
        )
        order by c.title
    `;

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: sessionUser.email, courses, offerings })
    };
};
