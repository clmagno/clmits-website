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

    const slug = String(body.slug || '');
    const position = Number(body.position);
    const completed = Boolean(body.completed);

    if (!slug || !Number.isInteger(position)) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing slug or position.' }) };
    }

    const sql = getDb();

    // Only let a learner mark progress on a module they've actually unlocked
    // (free preview, or an active subscription) — same gate course-content.js uses.
    const [module] = await sql`
        select m.id, m.is_free_preview, c.requires_subscription
        from modules m
        join courses c on c.id = m.course_id
        where c.slug = ${slug} and m.position = ${position}
    `;

    let hasSubscription = false;
    if (module && module.requires_subscription) {
        const [me] = await sql`select subscription_until from users where id = ${sessionUser.id}`;
        hasSubscription = Boolean(me && me.subscription_until && new Date(me.subscription_until) > new Date());
    }
    const unlocked = module && (module.is_free_preview || (module.requires_subscription ? hasSubscription : true));

    if (!unlocked) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Not unlocked.' }) };
    }

    if (completed) {
        await sql`
            insert into module_progress (user_id, module_id)
            values (${sessionUser.id}, ${module.id})
            on conflict (user_id, module_id) do nothing
        `;
    } else {
        await sql`
            delete from module_progress where user_id = ${sessionUser.id} and module_id = ${module.id}
        `;
    }

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, completed })
    };
};
