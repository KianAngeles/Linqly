const { MailerSend, EmailParams, Sender, Recipient } = require("mailersend");

const mailerSend = new MailerSend({
  apiKey: process.env.MAILERSEND_API_KEY,
});

async function sendPasswordResetEmail({ to, resetLink }) {
  const sentFrom = new Sender(
    process.env.MAIL_FROM_EMAIL,
    process.env.MAIL_FROM_NAME
  );

  const recipients = [new Recipient(to)];

  const emailParams = new EmailParams()
    .setFrom(sentFrom)
    .setTo(recipients)
    .setSubject("Reset your password")
    .setHtml(`
      <p>We received a request to reset your password.</p>
      <p>
        <a href="${resetLink}">
          Click here to reset your password
        </a>
      </p>
      <p>This link expires in 15 minutes.</p>
      <p>If you did not request this, you can safely ignore this email.</p>
    `)
    .setText(`Reset your password: ${resetLink}`);

  await mailerSend.email.send(emailParams);
}

module.exports = { sendPasswordResetEmail };
