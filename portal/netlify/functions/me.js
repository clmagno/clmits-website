const { getDb } = require('./_lib/db');
const { getSessionUser } = require('./_lib/auth');
const { toDateString } = require('./_lib/dates');

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const sessionUser = getSessionUser(event);
    if (!sessionUser) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Not signed in.' }) };
    }

    const sql = getDb();

    const [me] = await sql`select subscription_until, role, must_change_password from users where id = ${sessionUser.id}`;
    const active = Boolean(me && me.subscription_until && new Date(me.subscription_until) > new Date());
    const role = me ? me.role : 'student';

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

    // Don't advertise "Reserve your slot" for a bootcamp the learner is
    // already actively enrolled in via a cohort.
    const offerings = await sql`
        select c.slug, c.title, c.description, c.inquiry_interest
        from courses c
        where c.is_catalog_only = true
        and not exists (
            select 1 from cohort_enrollments ce
            join cohorts co on co.id = ce.cohort_id
            where co.course_id = c.id and ce.user_id = ${sessionUser.id} and ce.status = 'active'
        )
        order by c.title
    `;

    const [cohortRow] = await sql`
        select co.id, co.name, co.schedule_type, co.start_date, co.duration_weeks,
               co.meet_link, co.drive_folder_url,
               c.title as course_title, c.slug as course_slug, c.lesson_plan
        from cohort_enrollments ce
        join cohorts co on co.id = ce.cohort_id
        join courses c on c.id = co.course_id
        where ce.user_id = ${sessionUser.id} and ce.status = 'active'
        order by co.start_date desc
        limit 1
    `;

    const cohort = cohortRow ? {
        name: cohortRow.name,
        courseTitle: cohortRow.course_title,
        courseSlug: cohortRow.course_slug,
        scheduleType: cohortRow.schedule_type,
        startDate: toDateString(cohortRow.start_date),
        durationWeeks: cohortRow.duration_weeks,
        meetLink: cohortRow.meet_link,
        driveFolderUrl: cohortRow.drive_folder_url,
        lessonPlan: cohortRow.lesson_plan
    } : null;

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: sessionUser.email,
            role,
            mustChangePassword: Boolean(me && me.must_change_password),
            canManageContent: role === 'admin' || role === 'instructor',
            subscription: { active, until: me ? me.subscription_until : null },
            courses,
            offerings,
            cohort
        })
    };
};
