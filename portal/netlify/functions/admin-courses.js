const { getDb } = require('./_lib/db');
const { getSessionUser } = require('./_lib/auth');
const { requireRole } = require('./_lib/roles');

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

exports.handler = async (event) => {
    const sessionUser = getSessionUser(event);
    const auth = await requireRole(sessionUser, ['admin', 'instructor']);
    if (!auth.ok) {
        return { statusCode: auth.statusCode, body: JSON.stringify({ error: auth.error }) };
    }

    const sql = getDb();

    if (event.httpMethod === 'GET') {
        const courses = await sql`
            select c.id, c.slug, c.title, c.description, c.requires_subscription, c.is_catalog_only,
                (select count(*) from modules m where m.course_id = c.id)::int as module_count
            from courses c
            order by c.title
        `;
        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courses }) };
    }

    if (event.httpMethod === 'POST') {
        let body;
        try {
            body = JSON.parse(event.body || '{}');
        } catch (err) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
        }

        const slug = String(body.slug || '').trim().toLowerCase();
        const title = String(body.title || '').trim();
        const description = String(body.description || '').trim();
        const requiresSubscription = Boolean(body.requiresSubscription);

        if (!SLUG_RE.test(slug)) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Slug must be lowercase letters, numbers, and hyphens only (e.g. "intro-to-sql").' }) };
        }
        if (!title) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Title is required.' }) };
        }

        const existing = await sql`select id from courses where slug = ${slug}`;
        if (existing.length > 0) {
            return { statusCode: 409, body: JSON.stringify({ error: 'A course with that slug already exists.' }) };
        }

        const [course] = await sql`
            insert into courses (slug, title, description, requires_subscription)
            values (${slug}, ${title}, ${description}, ${requiresSubscription})
            returning id, slug, title
        `;

        return { statusCode: 201, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ course }) };
    }

    return { statusCode: 405, body: 'Method Not Allowed' };
};
