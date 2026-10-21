const nodemailer = require('nodemailer');

// Plain SMTP, not a provider-specific shortcut -- works with GoDaddy
// Workspace Email, Microsoft 365, Gmail, or anything else that exposes
// standard SMTP auth.
let transporter;

function getTransporter() {
    if (!transporter) {
        const required = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD'];
        const missing = required.filter((key) => !process.env[key]);
        if (missing.length) {
            throw new Error(`Missing email env vars: ${missing.join(', ')}`);
        }
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT),
            secure: process.env.SMTP_SECURE !== 'false', // true (port 465) unless explicitly disabled
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD
            }
        });
    }
    return transporter;
}

async function sendMail({ to, subject, html }) {
    const fromName = process.env.SMTP_FROM_NAME || 'CL Magno I.T. Solutions';
    await getTransporter().sendMail({
        from: `"${fromName}" <${process.env.SMTP_USER}>`,
        to,
        subject,
        html
    });
}

module.exports = { sendMail };
