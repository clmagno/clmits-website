const { getDb } = require('./_lib/db');
const { getSessionUser } = require('./_lib/auth');
const { requireRole } = require('./_lib/roles');
const { toDateString } = require('./_lib/dates');

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const sessionUser = getSessionUser(event);
    const auth = await requireRole(sessionUser, ['admin']);
    if (!auth.ok) {
        return { statusCode: auth.statusCode, body: JSON.stringify({ error: auth.error }) };
    }

    const sql = getDb();

    const [{ count: totalStudents }] = await sql`select count(*)::int as count from users`;
    const [{ count: activeSubscriptions }] = await sql`
        select count(*)::int as count from users where subscription_until is not null and subscription_until > now()
    `;
    const [{ count: pendingRegistrations }] = await sql`
        select count(*)::int as count from bootcamp_registrations where status = 'pending'
    `;

    const pending = await sql`
        select id, full_name, email, phone, offering_slug, tier, tier_label,
               amount_centavos, total_price_centavos, created_at
        from bootcamp_registrations
        where status = 'pending'
        order by created_at desc
        limit 8
    `;

    const nextCohortRows = await sql`
        select co.id, co.name, co.schedule_type, co.start_date, co.duration_weeks,
               co.capacity_early_bird, co.capacity_standard,
               c.title as course_title,
               (select count(*)::int from cohort_enrollments ce where ce.cohort_id = co.id and ce.status = 'active' and ce.tier = 'early_bird') as active_early_bird,
               (select count(*)::int from cohort_enrollments ce where ce.cohort_id = co.id and ce.status = 'active' and ce.tier = 'standard') as active_standard
        from cohorts co join courses c on c.id = co.course_id
        where co.start_date >= current_date
        order by co.start_date asc
        limit 1
    `;
    const nextCohort = nextCohortRows[0] ? { ...nextCohortRows[0], start_date: toDateString(nextCohortRows[0].start_date) } : null;

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            stats: { totalStudents, activeSubscriptions, pendingRegistrations },
            pendingRegistrations: pending,
            nextCohort
        })
    };
};
