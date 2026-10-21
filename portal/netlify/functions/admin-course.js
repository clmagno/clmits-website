const { getDb } = require('./_lib/db');
const { getSessionUser } = require('./_lib/auth');
const { requireRole } = require('./_lib/roles');

exports.handler = async (event) => {
    const sessionUser = getSessionUser(event);
    const auth = await requireRole(sessionUser, ['admin', 'instructor']);
    if (!auth.ok) {
        return { statusCode: auth.statusCode, body: JSON.stringify({ error: auth.error }) };
    }

    const sql = getDb();
    const slug = (event.queryStringParameters || {}).slug;
    if (!slug) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing slug.' }) };
    }

    const [course] = await sql`
        select id, slug, title, description, requires_subscription, is_catalog_only, lesson_plan, setup_guide_url
        from courses where slug = ${slug}
    `;
    if (!course) {
        return { statusCode: 404, body: JSON.stringify({ error: 'Course not found.' }) };
    }

    if (event.httpMethod === 'GET') {
        // Unlike course-content.js (the student-facing endpoint), this never
        // redacts video_url/reading_content -- an editor needs to see what's
        // actually saved regardless of free-preview status.
        const modules = await sql`
            select m.id, m.position, m.title, m.description, m.video_url, m.reading_content, m.is_free_preview,
                exists(select 1 from quizzes q where q.module_id = m.id) as has_quiz
            from modules m
            where m.course_id = ${course.id}
            order by m.position
        `;
        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ course, modules }) };
    }

    if (event.httpMethod === 'PATCH') {
        let body;
        try {
            body = JSON.parse(event.body || '{}');
        } catch (err) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
        }

        const title = String(body.title || '').trim();
        if (!title) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Title is required.' }) };
        }

        await sql`
            update courses set
                title = ${title},
                description = ${String(body.description || '').trim()},
                requires_subscription = ${Boolean(body.requiresSubscription)},
                lesson_plan = ${body.lessonPlan ? String(body.lessonPlan) : null},
                setup_guide_url = ${body.setupGuideUrl ? String(body.setupGuideUrl).trim() : null}
            where id = ${course.id}
        `;
        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, body: 'Method Not Allowed' };
};
