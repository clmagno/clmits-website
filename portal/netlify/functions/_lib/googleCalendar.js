const { getDb } = require('./db');

// Minimal Calendar API client -- one connected Google account (singleton row
// in google_integration), refreshed on every call since access tokens expire
// in ~1hr and there's no cron here to pre-refresh them.

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';
const TIME_ZONE = 'Asia/Manila';

async function getConnectedAccount() {
    const sql = getDb();
    const [row] = await sql`select refresh_token, connected_email from google_integration where id = 1`;
    return row && row.refresh_token ? row : null;
}

async function getAccessToken() {
    const account = await getConnectedAccount();
    if (!account) {
        throw new Error('Google Calendar is not connected yet.');
    }
    const res = await fetch(OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
            client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
            refresh_token: account.refresh_token,
            grant_type: 'refresh_token'
        })
    });
    const json = await res.json();
    if (!res.ok) {
        throw new Error(json.error_description || json.error || 'Failed to refresh Google access token.');
    }
    return json.access_token;
}

// Class block per schedule type -- [hour, minute] 24h, Asia/Manila local time.
// Weekday end time (9 PM) is an assumed 2hr block; the welcome email only
// states the start time, matching what was actually given to send, but the
// calendar event itself needs an end time.
function scheduleBlock(scheduleType) {
    if (scheduleType === 'weekend') return { start: [16, 0], end: [19, 0] };
    return { start: [19, 0], end: [21, 0] };
}

function buildRRule({ scheduleType, durationWeeks }) {
    if (scheduleType === 'weekend') {
        return `RRULE:FREQ=WEEKLY;BYDAY=SA;COUNT=${durationWeeks}`;
    }
    return `RRULE:FREQ=WEEKLY;BYDAY=TU,WE,FR;COUNT=${durationWeeks * 3}`;
}

function toLocalDateTime(dateYMD, [hour, minute]) {
    const hh = String(hour).padStart(2, '0');
    const mm = String(minute).padStart(2, '0');
    return `${dateYMD}T${hh}:${mm}:00`;
}

// Creates ONE recurring event (with an auto-generated Meet link) covering the
// whole cohort. Not re-called on edits -- if a cohort's schedule changes
// after creation, the admin edits/replaces the meet_link field manually.
async function createCohortEvent({ summary, description, startDate, scheduleType, durationWeeks }) {
    const accessToken = await getAccessToken();
    const { start, end } = scheduleBlock(scheduleType);
    const requestId = `cohort-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const payload = {
        summary,
        description,
        start: { dateTime: toLocalDateTime(startDate, start), timeZone: TIME_ZONE },
        end: { dateTime: toLocalDateTime(startDate, end), timeZone: TIME_ZONE },
        recurrence: [buildRRule({ scheduleType, durationWeeks })],
        conferenceData: {
            createRequest: { requestId, conferenceSolutionKey: { type: 'hangoutsMeet' } }
        }
    };

    const res = await fetch(`${CALENDAR_API_BASE}/calendars/primary/events?conferenceDataVersion=1`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (!res.ok) {
        throw new Error((json.error && json.error.message) || 'Failed to create the Google Calendar event.');
    }

    const videoEntry = json.conferenceData && json.conferenceData.entryPoints
        && json.conferenceData.entryPoints.find((e) => e.entryPointType === 'video');

    return {
        meetLink: json.hangoutLink || (videoEntry && videoEntry.uri) || null,
        eventId: json.id
    };
}

module.exports = { getAccessToken, getConnectedAccount, createCohortEvent, buildRRule };
