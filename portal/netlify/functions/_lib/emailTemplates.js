// Pure formatting helpers (no DB/network) -- kept separate and exported so
// they can be unit-tested directly for timezone/off-by-one-day bugs.

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

// Accepts either a 'YYYY-MM-DD' string or the real JS Date object the Neon
// driver actually returns for a Postgres `date` column (it represents
// correct local midnight -- read it with local getters, never toISOString/
// UTC, which would shift the calendar date backward by a day).
function formatDateYMD(value) {
    let y, m, d;
    if (value instanceof Date) {
        y = value.getFullYear();
        m = value.getMonth() + 1;
        d = value.getDate();
    } else {
        [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
    }
    return `${MONTH_NAMES[m - 1]} ${d}, ${y}`;
}

function scheduleDaysAndTime(scheduleType) {
    if (scheduleType === 'weekend') {
        return { days: 'Saturdays', time: '4:00 PM – 7:00 PM' };
    }
    return { days: 'Tuesdays, Wednesdays & Fridays', time: '7:00 PM' };
}

function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function firstNameOf(fullName) {
    const trimmed = String(fullName || '').trim();
    if (!trimmed) return 'there';
    return trimmed.split(/\s+/)[0];
}

const SIGNATURE_HTML = `
    <p>See you in class!</p>
    <p style="margin-top:24px;">Best regards,</p>
    <p style="margin:0;"><strong>Christopher Lloyd Magno</strong><br>
    Founder, CL Magno I.T. Solutions</p>
    <p style="margin-top:8px;color:#555;">0918-685-1819<br>02 8654 2970</p>
`;

const BASE_STYLE = 'font-family: Arial, Helvetica, sans-serif; font-size: 15px; line-height: 1.6; color: #111;';

// Full welcome email for a brand-new account: schedule + Meet link + setup
// guide + the "Hello World" pre-work challenge + login credentials.
function welcomeEmail({ fullName, email, tempPassword, courseTitle, cohort, portalUrl }) {
    const { days, time } = scheduleDaysAndTime(cohort.schedule_type);
    const firstClassDate = formatDateYMD(cohort.start_date);
    const setupGuideSection = cohort.setupGuideUrl
        ? `<p><strong>1. Download the Setup Guide:</strong> <a href="${escapeHtml(cohort.setupGuideUrl)}">${escapeHtml(cohort.setupGuideUrl)}</a></p>
           <p style="margin-top:-8px;color:#555;">Inside: Step-by-step instructions to install Python, VS Code, and Git.</p>`
        : '';
    const meetSection = cohort.meetLink
        ? `<p><strong>Link:</strong> <a href="${escapeHtml(cohort.meetLink)}">${escapeHtml(cohort.meetLink)}</a></p>`
        : `<p><strong>Link:</strong> We'll send the class link separately before your first session.</p>`;

    const subject = `Welcome to ${courseTitle} — Your Pre-Work Starter Pack`;

    const html = `
    <meta charset="UTF-8">
    <div style="${BASE_STYLE}">
        <p>Hi ${escapeHtml(firstNameOf(fullName))},</p>

        <p>Congratulations on securing your spot in the CL Magno I.T. Solutions <strong>${escapeHtml(courseTitle)}</strong>!
        You've just taken the first step toward mastering one of the most high-demand skills in the tech industry.
        Over the next ${cohort.durationWeeks} weeks, we are going to build serious infrastructure, write professional-grade code,
        and turn you into a job-ready professional.</p>

        <p>We move fast. To ensure we can dive straight into coding on Day 1, I need you to complete a few setup tasks beforehand.</p>

        <p style="font-weight:bold;margin-top:24px;">👇 YOUR PRE-WORK STARTER PACK</p>
        <p>Please complete the following steps before our first session on ${firstClassDate}.</p>

        ${setupGuideSection}

        <p><strong>2. The "Hello World" Challenge:</strong> Once you have installed the tools from the Setup Guide, I have a small challenge for you:</p>
        <ul>
            <li>Create a folder named <code>CLMagno_Bootcamp</code>.</li>
            <li>Inside, create a file named <code>hello.py</code>.</li>
            <li>Write a script that prints: <code>"I am ready to be a Data Engineer!"</code></li>
        </ul>

        <p style="font-weight:bold;margin-top:24px;">🗓️ FIRST CLASS REMINDER:</p>
        <p><strong>Date:</strong> ${firstClassDate}</p>
        <p><strong>Time:</strong> ${days}, ${time}</p>
        ${meetSection}

        <p>If you get stuck on any of the installation steps, don't worry! Send a screenshot of the error to us,
        and I (or one of our mentors) will help you out.</p>

        <div style="margin:24px 0;padding:16px;border:1px solid #ddd;border-radius:8px;background:#f7f7f7;">
            <p style="margin:0 0 8px 0;font-weight:bold;">Your Portal Login</p>
            <p style="margin:0;">Email: ${escapeHtml(email)}</p>
            <p style="margin:0;">Temporary Password: <code>${escapeHtml(tempPassword)}</code></p>
            <p style="margin:8px 0 0 0;"><a href="${escapeHtml(portalUrl)}/login.html">${escapeHtml(portalUrl)}/login.html</a></p>
            <p style="margin:8px 0 0 0;color:#b45309;font-weight:bold;">⚠️ This is a temporary password. Please log in and change it from your Account page as soon as possible.</p>
        </div>

        ${SIGNATURE_HTML}
    </div>`;

    return { subject, html };
}

// Lighter email for an attendee who already has a portal account (e.g. they
// signed up for a self-paced course first) -- adds them to a cohort without
// ever touching their existing password.
function cohortAddedEmail({ fullName, courseTitle, cohort, portalUrl }) {
    const { days, time } = scheduleDaysAndTime(cohort.schedule_type);
    const firstClassDate = formatDateYMD(cohort.start_date);
    const meetSection = cohort.meetLink
        ? `<p><strong>Link:</strong> <a href="${escapeHtml(cohort.meetLink)}">${escapeHtml(cohort.meetLink)}</a></p>`
        : `<p><strong>Link:</strong> We'll send the class link separately before your first session.</p>`;
    const setupGuideSection = cohort.setupGuideUrl
        ? `<p><strong>Setup Guide:</strong> <a href="${escapeHtml(cohort.setupGuideUrl)}">${escapeHtml(cohort.setupGuideUrl)}</a></p>`
        : '';

    const subject = `You're In! ${courseTitle} — Schedule & Class Link`;

    const html = `
    <meta charset="UTF-8">
    <div style="${BASE_STYLE}">
        <p>Hi ${escapeHtml(firstNameOf(fullName))},</p>

        <p>You're all set for the CL Magno I.T. Solutions <strong>${escapeHtml(courseTitle)}</strong>! Here's your first-class info:</p>

        <p style="font-weight:bold;margin-top:24px;">🗓️ FIRST CLASS REMINDER:</p>
        <p><strong>Date:</strong> ${firstClassDate}</p>
        <p><strong>Time:</strong> ${days}, ${time}</p>
        ${meetSection}
        ${setupGuideSection}

        <p>Log in to your existing portal account to see the full schedule and lesson plan any time:
        <a href="${escapeHtml(portalUrl)}/login.html">${escapeHtml(portalUrl)}/login.html</a></p>

        <p>If you get stuck on anything, send us a message and we'll help you out.</p>

        ${SIGNATURE_HTML}
    </div>`;

    return { subject, html };
}

module.exports = { welcomeEmail, cohortAddedEmail, formatDateYMD, scheduleDaysAndTime, firstNameOf };
