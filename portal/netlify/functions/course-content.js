const { getDb } = require('./_lib/db');
const { getSessionUser } = require('./_lib/auth');

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const slug = (event.queryStringParameters || {}).slug;
    if (!slug) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing slug.' }) };
    }

    const sql = getDb();
    const [course] = await sql`select id, slug, title, description from courses where slug = ${slug}`;
    if (!course) {
        return { statusCode: 404, body: JSON.stringify({ error: 'Course not found.' }) };
    }

    const sessionUser = getSessionUser(event);
    let enrolled = false;
    if (sessionUser) {
        const [row] = await sql`
            select 1 from enrollments where user_id = ${sessionUser.id} and course_id = ${course.id}
        `;
        enrolled = Boolean(row);
    }

    const modules = await sql`
        select m.position, m.title, m.description, m.video_url, m.is_free_preview,
            exists (
                select 1 from module_progress mp
                where mp.module_id = m.id and mp.user_id = ${sessionUser ? sessionUser.id : null}
            ) as completed
        from modules m
        where m.course_id = ${course.id}
        order by m.position
    `;

    const payload = modules.map((m) => {
        const unlocked = m.is_free_preview || enrolled;
        return {
            position: m.position,
            title: m.title,
            description: m.description,
            locked: !unlocked,
            completed: unlocked && m.completed,
            // Never send a video_url for a module the caller hasn't unlocked.
            video_url: unlocked ? m.video_url : null
        };
    });

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            course: { slug: course.slug, title: course.title, description: course.description },
            enrolled,
            signedIn: Boolean(sessionUser),
            modules: payload
        })
    };
};
