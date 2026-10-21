const nodemailer = require('nodemailer');

let transporter;

function getTransporter() {
    if (!transporter) {
        if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
            throw new Error('GMAIL_USER / GMAIL_APP_PASSWORD are not set');
        }
        transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.GMAIL_USER,
                pass: process.env.GMAIL_APP_PASSWORD
            }
        });
    }
    return transporter;
}

async function sendMail({ to, subject, html }) {
    const fromName = process.env.GMAIL_FROM_NAME || 'CL Magno I.T. Solutions';
    await getTransporter().sendMail({
        from: `"${fromName}" <${process.env.GMAIL_USER}>`,
        to,
        subject,
        html
    });
}

module.exports = { sendMail };
