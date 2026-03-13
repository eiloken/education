import dotenv from 'dotenv';
dotenv.config();

import nodemailer from 'nodemailer';

// Reuse a single transporter instance
const transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for 587
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

const FROM = process.env.SMTP_FROM || `"Vibeflix" <${process.env.SMTP_USER}>`;
const APP  = process.env.CLIENT_URL || 'http://localhost:5173';

/** Send temporary password to newly approved user */
export async function sendApprovalEmail(email, username, tempPassword) {
    await transporter.sendMail({
        from:    FROM,
        to:      email,
        subject: '✅ Your Vibeflix account has been approved',
        html: `
            <div style="font-family:sans-serif;max-width:500px;margin:auto">
                <h2 style="color:#ef4444">Welcome to Vibeflix, ${username}!</h2>
                <p>Your account request has been <strong>approved</strong>. You can now log in with:</p>
                <table style="margin:16px 0;border-collapse:collapse">
                    <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Username</td>
                        <td style="padding:4px 0"><strong>${username}</strong></td></tr>
                    <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Temporary&nbsp;password</td>
                        <td style="padding:4px 0"><code style="background:#f3f4f6;padding:2px 6px;border-radius:4px">${tempPassword}</code></td></tr>
                </table>
                <p>⚠️ You will be required to change your password on first login.</p>
                <a href="${APP}/login"
                   style="display:inline-block;margin-top:8px;padding:10px 20px;background:#ef4444;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">
                    Log in now →
                </a>
                <p style="color:#9ca3af;font-size:12px;margin-top:24px">
                    If you did not request an account, please ignore this email.
                </p>
            </div>`,
    });
}

/** Notify user that their request was rejected */
export async function sendRejectionEmail(email, username) {
    await transporter.sendMail({
        from:    FROM,
        to:      email,
        subject: '❌ Your Vibeflix account request was not approved',
        html: `
            <div style="font-family:sans-serif;max-width:500px;margin:auto">
                <h2 style="color:#6b7280">Account Request Update</h2>
                <p>Hi <strong>${username}</strong>,</p>
                <p>Unfortunately, your request for a Vibeflix account was <strong>not approved</strong> at this time.</p>
                <p>If you believe this is a mistake, please reach out to the administrator directly.</p>
                <p style="color:#9ca3af;font-size:12px;margin-top:24px">— The Vibeflix Team</p>
            </div>`,
    });
}
