const BookingRequest = require("../models/BookingRequest");
const Notification = require("../models/Notification");
const { sendDepositExpiredEmail, sendAdminDepositExpiredAlert } = require("./mailer");

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

async function checkExpiredDeposits(stripe) {
  const expired = await BookingRequest.find({
    status: "accepted",
    depositStatus: "pending",
    archived: { $ne: true },
    depositDueDate: { $exists: true, $lt: new Date() },
  });

  for (const stale of expired) {
    const booking = await BookingRequest.findOneAndUpdate(
      { _id: stale._id, status: "accepted", depositStatus: "pending" },
      { status: "declined" },
      { new: true }
    );
    if (!booking) continue; // paid or already resolved between the query and here

    if (booking.depositInvoiceId) {
      try {
        await stripe.invoices.voidInvoice(booking.depositInvoiceId);
      } catch (err) {
        console.error("Deposit invoice void error:", err.message);
      }
    }

    sendDepositExpiredEmail(booking);
    sendAdminDepositExpiredAlert(booking);

    if (booking.clientId) {
      await Notification.create({
        userId: booking.clientId,
        bookingId: booking._id,
        crCode: booking.crCode,
        type: "project_dismissed",
        message: `Project ${booking.crCode} has been put on hold — the deposit due date passed without payment. Reach out whenever you're ready to pick it back up.`,
      });
    }
  }
}

function startDepositExpiryJob(stripe) {
  checkExpiredDeposits(stripe).catch((err) => console.error("Deposit expiry check error:", err.message));
  setInterval(() => {
    checkExpiredDeposits(stripe).catch((err) => console.error("Deposit expiry check error:", err.message));
  }, CHECK_INTERVAL_MS);
}

module.exports = { startDepositExpiryJob, checkExpiredDeposits };
