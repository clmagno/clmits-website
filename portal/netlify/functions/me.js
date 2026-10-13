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

    const [me] = await sql`select subscription_until from users where id = ${sessionUser.id}`;
    const active = Boolean(me && me.subscription_until && new Date(me.subscription_until) > new Date());

    const courses = await sql`
        select
            c.slug,
            c.title,
            c.description,
            count(m.id)::int as total_modules,
            count(mp.module_id)::int as completed_modules
        from courses c
        left join modules m on m.course_id = c.id
        left join module_progress mp on mp.module_id = m.id and mp.user_id = ${sessionUser.id}
        where c.requires_subscription = true
        group by c.slug, c.title, c.description
        order by c.title
    `;

    const offerings = await sql`
        select c.slug, c.title, c.description, c.inquiry_interest
        from courses c
        where c.is_catalog_only = true
        order by c.title
    `;

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: sessionUser.email,
            subscription: { active, until: me ? me.subscription_until : null },
            courses,
            offerings
        })
    };
};
