const { getDb } = require('./_lib/db');
const { getSessionUser } = require('./_lib/auth');
const { requireRole } = require('./_lib/roles');
const { normalizeVideoUrl, sanitizeHtml } = require('./_lib/content');

exports.handler = async (event) => {
    const sessionUser = getSessionUser(event);
    const auth = await requireRole(sessionUser, ['admin', 'instructor']);
    if (!auth.ok) {
        return { statusCode: auth.statusCode, body: JSON.stringify({ error: auth.error }) };
    }

    const sql = getDb();

    if (event.httpMethod === 'POST') {
        let body;
        try {
            body = JSON.parse(event.body || '{}');
        } catch (err) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
        }

        const courseSlug = String(body.courseSlug || '').trim();
        const title = String(body.title || '').trim();
        if (!courseSlug || !title) {
            return { statusCode: 400, body: JSON.stringify({ error: 'courseSlug and title are required.' }) };
        }

        const [course] = await sql`select id from courses where slug = ${courseSlug}`;
        if (!course) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Course not found.' }) };
        }

        const [{ next_position: nextPosition }] = await sql`
            select coalesce(max(position), 0) + 1 as next_position from modules where course_id = ${course.id}
        `;

        const [module] = await sql`
            insert into modules (course_id, position, title, description, video_url, reading_content, is_free_preview)
            values (
                ${course.id}, ${nextPosition}, ${title}, ${String(body.description || '').trim()},
                ${normalizeVideoUrl(body.videoUrl)}, ${sanitizeHtml(body.readingContent)},
                ${Boolean(body.isFreePreview)}
            )
            returning id, position
        `;
        return { statusCode: 201, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ module }) };
    }

    if (event.httpMethod === 'PATCH') {
        let body;
        try {
            body = JSON.parse(event.body || '{}');
        } catch (err) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
        }

        const moduleId = body.moduleId;
        const title = String(body.title || '').trim();
        if (!moduleId || !title) {
            return { statusCode: 400, body: JSON.stringify({ error: 'moduleId and title are required.' }) };
        }

        const result = await sql`
            update modules set
                title = ${title},
                description = ${String(body.description || '').trim()},
                video_url = ${normalizeVideoUrl(body.videoUrl)},
                reading_content = ${sanitizeHtml(body.readingContent)},
                is_free_preview = ${Boolean(body.isFreePreview)}
            where id = ${moduleId}
            returning id
        `;
        if (result.length === 0) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Module not found.' }) };
        }
        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
    }

    if (event.httpMethod === 'DELETE') {
        const moduleId = (event.queryStringParameters || {}).moduleId;
        if (!moduleId) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing moduleId.' }) };
        }
        // Cascades to module_progress and quizzes (schema.sql / 003 migration
        // both define those FKs as ON DELETE CASCADE), so this also clears any
        // learner progress and quiz tied to this module -- expected for a delete.
        await sql`delete from modules where id = ${moduleId}`;
        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, body: 'Method Not Allowed' };
};
