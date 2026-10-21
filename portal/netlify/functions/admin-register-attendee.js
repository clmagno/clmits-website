const bcrypt = require('bcryptjs');
const { getDb } = require('./_lib/db');
const { getSessionUser } = require('./_lib/auth');
const { requireRole } = require('./_lib/roles');
const { generateTempPassword } = require('./_lib/tempPassword');
const { welcomeEmail, cohortAddedEmail } = require('./_lib/emailTemplates');
const { sendMail } = require('./_lib/email');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

exports.handler = async (event) => {
    const sessionUser = getSessionUser(event);
    const auth = await requireRole(sessionUser, ['admin']);
    if (!auth.ok) {
        return { statusCode: auth.statusCode, body: JSON.stringify({ error: auth.error }) };
    }

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch (err) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
    }

    const fullName = String(body.fullName || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const phone = body.phone ? String(body.phone).trim() : null;
    const cohortId = String(body.cohortId || '').trim();
    const tier = String(body.tier || '').trim();

    if (!fullName || !EMAIL_RE.test(email) || !cohortId || !['early_bird', 'standard'].includes(tier)) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Name, a valid email, a cohort, and a pricing tier are required.' }) };
    }

    const sql = getDb();
    const portalUrl = process.env.PORTAL_URL || 'https://portal.clmits.com';

    const [cohort] = await sql`
        select co.id, co.name, co.schedule_type, co.start_date, co.duration_weeks, co.meet_link,
               c.title as course_title, c.setup_guide_url
        from cohorts co join courses c on c.id = co.course_id
        where co.id = ${cohortId}
    `;
    if (!cohort) {
        return { statusCode: 404, body: JSON.stringify({ error: 'Cohort not found.' }) };
    }

    const cohortForEmail = {
        schedule_type: cohort.schedule_type,
        start_date: cohort.start_date,
        durationWeeks: cohort.duration_weeks,
        meetLink: cohort.meet_link,
        setupGuideUrl: cohort.setup_guide_url
    };

    const [existingUser] = await sql`select id, full_name from users where email = ${email}`;

    let userId;
    let emailResult;

    if (existingUser) {
        // Already has an account (e.g. signed up for a self-paced course
        // first) -- attach them to this cohort, never touch their password.
        userId = existingUser.id;
        if (!existingUser.full_name && fullName) {
            await sql`update users set full_name = ${fullName}, phone = coalesce(phone, ${phone}) where id = ${userId}`;
        }

        const { subject, html } = cohortAddedEmail({
            fullName: existingUser.full_name || fullName,
            courseTitle: cohort.course_title,
            cohort: cohortForEmail,
            portalUrl
        });
        try {
            await sendMail({ to: email, subject, html });
            emailResult = { sent: true };
        } catch (err) {
            emailResult = { sent: false, error: err.message };
        }
    } else {
        const tempPassword = generateTempPassword();
        const passwordHash = await bcrypt.hash(tempPassword, 10);
        const [created] = await sql`
            insert into users (email, password_hash, full_name, phone, must_change_password)
            values (${email}, ${passwordHash}, ${fullName}, ${phone}, true)
            returning id
        `;
        userId = created.id;

        const { subject, html } = welcomeEmail({
            fullName,
            email,
            tempPassword,
            courseTitle: cohort.course_title,
            cohort: cohortForEmail,
            portalUrl
        });
        try {
            await sendMail({ to: email, subject, html });
            emailResult = { sent: true };
        } catch (err) {
            // Don't lose the only copy of the plaintext password -- hand it
            // back to the admin to deliver manually if the send failed.
            emailResult = { sent: false, error: err.message, tempPassword };
        }
    }

    await sql`
        insert into cohort_enrollments (user_id, cohort_id, tier)
        values (${userId}, ${cohortId}, ${tier})
        on conflict (user_id, cohort_id) do update set status = 'active', tier = ${tier}
    `;

    return {
        statusCode: 201,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ok: true,
            userId,
            isNewAccount: !existingUser,
            emailSent: emailResult.sent,
            emailError: emailResult.sent ? null : emailResult.error,
            tempPassword: emailResult.tempPassword || null
        })
    };
};
