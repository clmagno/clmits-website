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

    const [{ count: totalStudents }] = await sql`select count(*)::int as count from users where role = 'student'`;
    const [{ count: activeSubscriptions }] = await sql`
        select count(*)::int as count from users where subscription_until is not null and subscription_until > now()
    `;
    const [{ count: selfPacedCourses }] = await sql`
        select count(*)::int as count from courses where requires_subscription = true
    `;
    const [{ count: liveSessions }] = await sql`select count(*)::int as count from cohorts`;
    const [{ total: totalRegistrations, paid: paidRegistrations, pending: pendingRegistrations }] = await sql`
        select count(*)::int as total,
               count(*) filter (where status = 'paid')::int as paid,
               count(*) filter (where status = 'pending')::int as pending
        from bootcamp_registrations
    `;

    const [{ total: regRevenue }] = await sql`
        select coalesce(sum(amount_centavos), 0)::int as total from bootcamp_registrations where status = 'paid'
    `;
    const [{ total: installmentRevenue }] = await sql`
        select coalesce(sum(amount_centavos), 0)::int as total from bootcamp_installments where status = 'paid'
    `;
    const [{ total: subRevenue }] = await sql`
        select coalesce(sum(amount_centavos), 0)::int as total from payments where status = 'paid'
    `;
    const revenueCentavos = regRevenue + installmentRevenue + subRevenue;

    // "Cost of earning" -- total contract value of every registration made
    // (paid + still pending), i.e. what the business stands to earn in full.
    const [{ total: potentialRevenueCentavos }] = await sql`
        select coalesce(sum(total_price_centavos), 0)::int as total from bootcamp_registrations
    `;

    const pending = await sql`
        select id, full_name, email, phone, offering_slug, tier, tier_label,
               amount_centavos, total_price_centavos, created_at
        from bootcamp_registrations
        where status = 'pending'
        order by created_at desc
        limit 8
    `;

    const upcomingCohortRows = await sql`
        select co.id, co.name, co.schedule_type, co.start_date, co.duration_weeks,
               co.capacity_early_bird, co.capacity_standard,
               c.title as course_title,
               (select count(*)::int from cohort_enrollments ce where ce.cohort_id = co.id and ce.status = 'active' and ce.tier = 'early_bird') as active_early_bird,
               (select count(*)::int from cohort_enrollments ce where ce.cohort_id = co.id and ce.status = 'active' and ce.tier = 'standard') as active_standard
        from cohorts co join courses c on c.id = co.course_id
        where co.start_date >= current_date
        order by co.start_date asc
        limit 4
    `;
    const upcomingCohorts = upcomingCohortRows.map((c) => ({ ...c, start_date: toDateString(c.start_date) }));

    const registrationTrendRows = await sql`
        select to_char(date_trunc('week', created_at), 'YYYY-MM-DD') as week, count(*)::int as count
        from bootcamp_registrations
        group by week
        order by week
    `;
    const signupTrendRows = await sql`
        select to_char(date_trunc('week', created_at), 'YYYY-MM-DD') as week, count(*)::int as count
        from users
        where role = 'student'
        group by week
        order by week
    `;
    const offeringBreakdown = await sql`
        select offering_slug, count(*)::int as count
        from bootcamp_registrations
        group by offering_slug
        order by count desc
    `;

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            stats: {
                totalStudents,
                activeSubscriptions,
                selfPacedCourses,
                liveSessions,
                totalRegistrations,
                paidRegistrations,
                pendingRegistrations,
                revenueCentavos,
                potentialRevenueCentavos
            },
            pendingRegistrations: pending,
            upcomingCohorts,
            registrationTrend: registrationTrendRows,
            signupTrend: signupTrendRows,
            offeringBreakdown
        })
    };
};
