const mongoose = require("mongoose");

// Only the sha256 hash of the raw token is stored — a DB leak alone doesn't
// yield a usable token. TTL index prunes expired rows automatically, same
// pattern as LoginAttempt; redemption also checks createdAt explicitly since
// the TTL sweep can lag up to ~60s behind the nominal expiry.
const passwordResetTokenSchema = new mongoose.Schema(
  {
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);

passwordResetTokenSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 });

module.exports = mongoose.model("PasswordResetToken", passwordResetTokenSchema);
