const nodemailer = require("nodemailer");

let transporter;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.PERSONAL_GMAIL,
        pass: process.env.APP_PASSWORD,
      },
    });
  }
  return transporter;
}

function sendMail({ to, subject, html }) {
  return getTransporter().sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject,
    html,
  }).catch((err) => console.error("Mail send error:", err));
}

function sendBookingConfirmation(booking) {
  return sendMail({
    to: booking.email,
    subject: `We've received your request — ${booking.crCode}`,
    html: `
      <p>Hi ${booking.name},</p>
      <p>Thank you for reaching out to Jarumiri Studios — we've received your booking request.</p>
      <p><strong>Your BR Code:</strong> ${booking.crCode}</p>
      <p>Please keep this code for your records. You can use it to check your project's status at any time on our <a href="https://jarumiristudios.com/track">tracking page</a>.</p>
      <p>We'll review your brief and follow up shortly.</p>
      <p>— Jarumiri Studios</p>
    `,
  });
}

function sendAdminNewBookingAlert(booking) {
  return sendMail({
    to: process.env.ADMIN_EMAIL,
    subject: `New booking request — ${booking.crCode}`,
    html: `
      <p>New booking submitted.</p>
      <ul>
        <li><strong>BR Code:</strong> ${booking.crCode}</li>
        <li><strong>Name:</strong> ${booking.name}</li>
        <li><strong>Email:</strong> ${booking.email}</li>
        <li><strong>Location:</strong> ${booking.location}</li>
        <li><strong>Service:</strong> ${booking.serviceType.join(", ")}</li>
        <li><strong>Tier:</strong> ${booking.pricingTier}</li>
      </ul>
      <p><a href="https://jarumiristudios.com/admin/booking/${booking._id}">View in admin dashboard →</a></p>
    `,
  });
}

function sendAcceptanceEmail(booking) {
  return sendMail({
    to: booking.email,
    subject: `Your request has been accepted — ${booking.crCode}`,
    html: `
      <p>Hi ${booking.name},</p>
      <p>We're pleased to let you know that your booking request has been reviewed and accepted.</p>
      <p><strong>BR Code:</strong> ${booking.crCode}</p>
      <p>A deposit invoice (30%) has been sent to this email address. Work will begin as soon as the deposit is received.</p>
      <p>You can follow your project's status at any time at <a href="https://jarumiristudios.com/track">jarumiristudios.com/track</a> using your BR code.</p>
      <p>— Jarumiri Studios</p>
    `,
  });
}

function sendAdminInvoiceAlert(booking, type, amount, invoiceUrl) {
  const label = type === "deposit" ? "Deposit (30%)" : "Final Payment (70%)";
  return sendMail({
    to: process.env.ADMIN_EMAIL,
    subject: `Invoice sent — ${booking.crCode} (${label})`,
    html: `
      <p>A Stripe invoice has been sent to the client.</p>
      <ul>
        <li><strong>Project:</strong> ${booking.crCode}</li>
        <li><strong>Client:</strong> ${booking.name} (${booking.email})</li>
        <li><strong>Type:</strong> ${label}</li>
        <li><strong>Amount:</strong> $${amount.toFixed(2)}</li>
      </ul>
      ${invoiceUrl ? `<p><a href="${invoiceUrl}">View Stripe invoice →</a></p>` : ""}
      <p><a href="https://jarumiristudios.com/admin/booking/${booking._id}">View project →</a></p>
    `,
  });
}

function sendAdminPaymentAlert(booking, type, amount) {
  const label = type === "deposit" ? "Deposit (30%)" : "Final Payment (70%)";
  return sendMail({
    to: process.env.ADMIN_EMAIL,
    subject: `Payment received — ${booking.crCode} (${label})`,
    html: `
      <p>A Stripe payment has been confirmed.</p>
      <ul>
        <li><strong>Project:</strong> ${booking.crCode}</li>
        <li><strong>Client:</strong> ${booking.name} (${booking.email})</li>
        <li><strong>Type:</strong> ${label}</li>
        <li><strong>Amount:</strong> $${amount.toFixed(2)}</li>
      </ul>
      <p><a href="https://jarumiristudios.com/admin/booking/${booking._id}">View project →</a></p>
    `,
  });
}

function sendDepositExpiredEmail(booking) {
  return sendMail({
    to: booking.email,
    subject: `Your project has been put on hold — ${booking.crCode}`,
    html: `
      <p>Hi ${booking.name},</p>
      <p>The deposit deadline for your project (<strong>${booking.crCode}</strong>) has passed without payment, so we've placed it on hold.</p>
      <p>We'd be glad to revisit this project — or take on a future one — whenever you're ready. Please don't hesitate to get in touch.</p>
      <p>— Jarumiri Studios</p>
    `,
  });
}

function sendAdminDepositExpiredAlert(booking) {
  return sendMail({
    to: process.env.ADMIN_EMAIL,
    subject: `Auto-declined (unpaid deposit) — ${booking.crCode}`,
    html: `
      <p>A project was automatically declined because its deposit due date passed without payment.</p>
      <ul>
        <li><strong>BR Code:</strong> ${booking.crCode}</li>
        <li><strong>Client:</strong> ${booking.name} (${booking.email})</li>
      </ul>
      <p><a href="https://jarumiristudios.com/admin/booking/${booking._id}">View project →</a></p>
    `,
  });
}

module.exports = { sendMail, sendBookingConfirmation, sendAdminNewBookingAlert, sendAcceptanceEmail, sendAdminInvoiceAlert, sendAdminPaymentAlert, sendDepositExpiredEmail, sendAdminDepositExpiredAlert };
