const { getDb } = require('./_lib/db');
const { getSessionUser } = require('./_lib/auth');
const { requireRole } = require('./_lib/roles');
const { createCohortEvent, getConnectedAccount } = require('./_lib/googleCalendar');
const { toDateString } = require('./_lib/dates');

// Admin-only -- a cohort roster exposes attendee PII (name, email, phone),
// same stricter gating as the Students/Registrations pages.

function weekdayMatchesSchedule(dateYMD, scheduleType) {
    const [y, m, d] = dateYMD.split('-').map(Number);
    const day = new Date(y, m - 1, d).getDay(); // local-component construction, no TZ string-parsing risk
    if (scheduleType === 'weekend') return day === 6; // Saturday
    return day === 2 || day === 3 || day === 5; // Tue/Wed/Fri
}

exports.handler = async (event) => {
    const sessionUser = getSessionUser(event);
    const auth = await requireRole(sessionUser, ['admin']);
    if (!auth.ok) {
        return { statusCode: auth.statusCode, body: JSON.stringify({ error: auth.error }) };
    }

    const sql = getDb();
    const qs = event.queryStringParameters || {};

    if (event.httpMethod === 'GET' && qs.id) {
        const [cohort] = await sql`
            select co.*, c.title as course_title, c.slug as course_slug
            from cohorts co join courses c on c.id = co.course_id
            where co.id = ${qs.id}
        `;
        if (!cohort) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Cohort not found.' }) };
        }
        const roster = await sql`
            select u.id as user_id, u.full_name, u.email, u.phone, ce.status, ce.enrolled_at
            from cohort_enrollments ce join users u on u.id = ce.user_id
            where ce.cohort_id = ${qs.id}
            order by ce.enrolled_at desc
        `;
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cohort: { ...cohort, start_date: toDateString(cohort.start_date) }, roster })
        };
    }

    if (event.httpMethod === 'GET') {
        const cohorts = await sql`
            select co.id, co.name, co.schedule_type, co.start_date, co.duration_weeks,
                   co.meet_link, co.drive_folder_url, co.capacity, co.created_at,
                   c.title as course_title, c.slug as course_slug,
                   (select count(*)::int from cohort_enrollments ce where ce.cohort_id = co.id and ce.status = 'active') as active_count
            from cohorts co join courses c on c.id = co.course_id
            order by co.start_date desc
        `;
        const account = await getConnectedAccount();
        const cohortsOut = cohorts.map((c) => ({ ...c, start_date: toDateString(c.start_date) }));
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cohorts: cohortsOut, googleConnected: Boolean(account), googleEmail: account ? account.connected_email : null })
        };
    }

    if (event.httpMethod === 'POST') {
        let body;
        try {
            body = JSON.parse(event.body || '{}');
        } catch (err) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
        }

        const courseId = String(body.courseId || '').trim();
        const name = String(body.name || '').trim();
        const scheduleType = String(body.scheduleType || '').trim();
        const startDate = String(body.startDate || '').trim();
        const durationWeeks = Number(body.durationWeeks) || 0;
        const driveFolderUrl = body.driveFolderUrl ? String(body.driveFolderUrl).trim() : null;
        const meetLink = body.meetLink ? String(body.meetLink).trim() : null;
        const autoCreateMeet = Boolean(body.autoCreateMeet);
        const capacity = body.capacity !== undefined && body.capacity !== '' ? Number(body.capacity) : null;

        if (!courseId || !name || !['weekday', 'weekend'].includes(scheduleType) || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || durationWeeks < 1) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing or invalid cohort fields.' }) };
        }
        if (!weekdayMatchesSchedule(startDate, scheduleType)) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: scheduleType === 'weekend'
                        ? 'Start date must be a Saturday for a weekend cohort.'
                        : 'Start date must be a Tuesday, Wednesday, or Friday for a weekday cohort.'
                })
            };
        }

        const [course] = await sql`select id, title from courses where id = ${courseId}`;
        if (!course) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Course not found.' }) };
        }

        let finalMeetLink = meetLink;
        let googleEventId = null;

        if (autoCreateMeet) {
            try {
                const result = await createCohortEvent({
                    summary: `${course.title} — ${name}`,
                    description: `CLMITS live cohort: ${course.title} (${name}). Managed from the admin portal.`,
                    startDate,
                    scheduleType,
                    durationWeeks
                });
                finalMeetLink = result.meetLink;
                googleEventId = result.eventId;
            } catch (err) {
                return { statusCode: 502, body: JSON.stringify({ error: `Could not create the Google Calendar event: ${err.message}` }) };
            }
        }

        const [cohort] = await sql`
            insert into cohorts (course_id, name, schedule_type, start_date, duration_weeks, meet_link, google_calendar_event_id, drive_folder_url, capacity)
            values (${courseId}, ${name}, ${scheduleType}, ${startDate}, ${durationWeeks}, ${finalMeetLink}, ${googleEventId}, ${driveFolderUrl}, ${capacity})
            returning id
        `;

        return { statusCode: 201, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: cohort.id }) };
    }

    if (event.httpMethod === 'PUT') {
        let body;
        try {
            body = JSON.parse(event.body || '{}');
        } catch (err) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
        }

        const id = String(body.id || '').trim();
        if (!id) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing cohort id.' }) };
        }

        const [existing] = await sql`select id from cohorts where id = ${id}`;
        if (!existing) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Cohort not found.' }) };
        }

        const name = String(body.name || '').trim();
        const scheduleType = String(body.scheduleType || '').trim();
        const startDate = String(body.startDate || '').trim();
        const durationWeeks = Number(body.durationWeeks) || 0;
        const driveFolderUrl = body.driveFolderUrl ? String(body.driveFolderUrl).trim() : null;
        const meetLink = body.meetLink ? String(body.meetLink).trim() : null;
        const capacity = body.capacity !== undefined && body.capacity !== '' ? Number(body.capacity) : null;

        if (!name || !['weekday', 'weekend'].includes(scheduleType) || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || durationWeeks < 1) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing or invalid cohort fields.' }) };
        }

        await sql`
            update cohorts
            set name = ${name}, schedule_type = ${scheduleType}, start_date = ${startDate},
                duration_weeks = ${durationWeeks}, drive_folder_url = ${driveFolderUrl}, meet_link = ${meetLink},
                capacity = ${capacity}
            where id = ${id}
        `;

        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
    }

    if (event.httpMethod === 'DELETE') {
        const id = qs.id;
        if (!id) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing cohort id.' }) };
        }
        await sql`delete from cohorts where id = ${id}`;
        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, body: 'Method Not Allowed' };
};
