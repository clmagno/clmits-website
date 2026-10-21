const crypto = require('crypto');

// Excludes visually-ambiguous characters (0/O, 1/l/I) since this gets typed
// by hand off an email on a phone screen.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const LENGTH = 12;

function generateTempPassword() {
    const bytes = crypto.randomBytes(LENGTH);
    let out = '';
    for (let i = 0; i < LENGTH; i++) {
        out += ALPHABET[bytes[i] % ALPHABET.length];
    }
    return out;
}

module.exports = { generateTempPassword };
