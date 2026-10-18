// Converts a plain YouTube watch/share URL into the embeddable youtube-nocookie
// form the <iframe> in course.html expects, so instructors can paste whatever
// URL YouTube gives them instead of needing to know the /embed/ format.
// Vimeo/direct embed URLs and anything else pass through unchanged.
function normalizeVideoUrl(raw) {
    const value = String(raw || '').trim();
    if (!value) return null;

    let url;
    try {
        url = new URL(value);
    } catch (err) {
        return null;
    }

    let videoId = null;
    if (url.hostname.includes('youtu.be')) {
        videoId = url.pathname.slice(1);
    } else if (url.hostname.includes('youtube.com')) {
        if (url.pathname === '/watch') videoId = url.searchParams.get('v');
        else if (url.pathname.startsWith('/embed/')) return value;
    }

    return videoId ? `https://www.youtube-nocookie.com/embed/${videoId}` : value;
}

// reading_content is rendered with innerHTML in course.html. It's meant for
// trusted admin/instructor authors, not public input, but this strips the
// obvious dangerous bits anyway as a baseline safety net against a careless
// or compromised account -- not a substitute for only granting the role to
// people you trust.
function sanitizeHtml(raw) {
    return String(raw || '')
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
        .replace(/\son\w+\s*=\s*"(?:[^"]*)"/gi, '')
        .replace(/\son\w+\s*=\s*'(?:[^']*)'/gi, '')
        .replace(/\son\w+\s*=\s*[^\s>]+/gi, '');
}

module.exports = { normalizeVideoUrl, sanitizeHtml };
