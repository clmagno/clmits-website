const { getDb } = require('./_lib/db');
const { getSessionUser } = require('./_lib/auth');
const { requireRole } = require('./_lib/roles');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const sessionUser = getSessionUser(event);
    const auth = await requireRole(sessionUser, ['admin', 'instructor']);
    if (!auth.ok) {
        return { statusCode: auth.statusCode, body: JSON.stringify({ error: auth.error }) };
    }

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch (err) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
    }

    const moduleId = body.moduleId;
    const direction = body.direction === 'up' ? 'up' : body.direction === 'down' ? 'down' : null;
    if (!moduleId || !direction) {
        return { statusCode: 400, body: JSON.stringify({ error: 'moduleId and direction ("up" or "down") are required.' }) };
    }

    const sql = getDb();
    const [current] = await sql`select id, course_id, position from modules where id = ${moduleId}`;
    if (!current) {
        return { statusCode: 404, body: JSON.stringify({ error: 'Module not found.' }) };
    }

    const neighbor =
        direction === 'up'
            ? await sql`select id, position from modules where course_id = ${current.course_id} and position < ${current.position} order by position desc limit 1`
            : await sql`select id, position from modules where course_id = ${current.course_id} and position > ${current.position} order by position asc limit 1`;

    if (neighbor.length === 0) {
        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, moved: false }) };
    }

    const other = neighbor[0];

    // Swap via a scratch position (-1) to avoid tripping the unique(course_id, position)
    // constraint, which would reject setting one row's position to a value the other
    // row still holds. Three sequential statements, matching this codebase's existing
    // "no multi-statement transactions" pattern (the neon serverless HTTP driver runs
    // each tagged query as its own round trip) -- fine for a low-frequency admin edit.
    await sql`update modules set position = -1 where id = ${current.id}`;
    await sql`update modules set position = ${current.position} where id = ${other.id}`;
    await sql`update modules set position = ${other.position} where id = ${current.id}`;

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, moved: true }) };
};
