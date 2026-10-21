const { getDb } = require('./_lib/db');
const { toDateString } = require('./_lib/dates');

// Public, no-auth endpoint -- called cross-origin from clmits.com (a separate
// static site/domain), same CORS pattern as bootcamp-checkout.js. Returns
// ONLY schedule/availability info, never attendee PII (no roster, no names,
// no emails) -- that stays behind admin-cohorts.js.
const ALLOWED_ORIGINS = ['https://clmits.com', 'https://www.clmits.com'];

function corsHeaders(event) {
    const origin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
    const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json'
    };
}

exports.handler = async (event) => {
    const headers = corsHeaders(event);

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const sql = getDb();
    const rows = await sql`
        select co.id, co.name, co.schedule_type, co.start_date, co.duration_weeks, co.capacity,
               c.title as course_title, c.slug as course_slug,
               (select count(*)::int from cohort_enrollments ce where ce.cohort_id = co.id and ce.status = 'active') as active_count
        from cohorts co
        join courses c on c.id = co.course_id
        where co.start_date >= current_date
        order by co.start_date asc
    `;

    const cohorts = rows.map((r) => ({
        courseTitle: r.course_title,
        courseSlug: r.course_slug,
        name: r.name,
        scheduleType: r.schedule_type,
        startDate: toDateString(r.start_date),
        durationWeeks: r.duration_weeks,
        slotsRemaining: r.capacity != null ? Math.max(0, r.capacity - r.active_count) : null,
        capacity: r.capacity
    }));

    return { statusCode: 200, headers, body: JSON.stringify({ cohorts }) };
};
