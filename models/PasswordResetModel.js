import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

// A "Forgot password" request (see controllers/passwordResetController.js).
// Pending  -> waiting for the administrator
// Issued   -> approved (approvedAt set: the waiting page opens "Set a new password" by itself)
//             or answered with a copyable one-time link (approvedAt empty)
// Used / Dismissed -> closed
// Nothing secret is stored in plain text: tokenHash, claimHash and codeHash are SHA-256 hashes.
export const PasswordReset = sequelize.define("PasswordReset", {
  userId: { type: DataTypes.INTEGER, allowNull: false },
  status: {
    type: DataTypes.ENUM("Pending", "Issued", "Used", "Dismissed"),
    allowNull: false,
    defaultValue: "Pending"
  },
  // One-time "Set a new password" token
  tokenHash: { type: DataTypes.STRING(64), allowNull: true, unique: true },
  expiresAt: { type: DataTypes.DATE, allowNull: true },
  // Proves the waiting browser is the one that sent the request (secret kept in its session)
  claimHash: { type: DataTypes.STRING(64), allowNull: true },
  // Not used any more (an earlier verification-code version); kept so existing tables stay valid
  codeHash: { type: DataTypes.STRING(64), allowNull: true },
  codeAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  approvedAt: { type: DataTypes.DATE, allowNull: true },
  usedAt: { type: DataTypes.DATE, allowNull: true }
});

export default PasswordReset;
