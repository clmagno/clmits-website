// Postgres `date` columns come back from the Neon driver as genuine JS Date
// objects representing correct local midnight for that calendar date (this
// process runs in Asia/Manila). Never let one of these cross a
// JSON.stringify boundary directly -- JSON serialization calls toISOString(),
// which converts to UTC and shifts the date backward by a day for any
// timezone ahead of UTC (confirmed: Dec 5 local became "2026-12-04T16:00:00.000Z").
// Always convert through local getters first, server-side, before the value
// is JSON-serialized or interpolated anywhere.
function toDateString(value) {
    if (value instanceof Date) {
        const y = value.getFullYear();
        const m = String(value.getMonth() + 1).padStart(2, '0');
        const d = String(value.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    return String(value).slice(0, 10);
}

module.exports = { toDateString };
