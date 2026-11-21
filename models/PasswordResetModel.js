import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

// A "Forgot password" request. The user asks from the login page, an administrator issues a
// one-time reset link from User Accounts, and the user sets a new password with it.
// Only a SHA-256 hash of the link's token is stored, never the token itself.
export const PasswordReset = sequelize.define("PasswordReset", {
  userId: { type: DataTypes.INTEGER, allowNull: false },
  status: {
    type: DataTypes.ENUM("Pending", "Issued", "Used", "Dismissed"),
    allowNull: false,
    defaultValue: "Pending"
  },
  tokenHash: { type: DataTypes.STRING(64), allowNull: true, unique: true },
  expiresAt: { type: DataTypes.DATE, allowNull: true },
  usedAt: { type: DataTypes.DATE, allowNull: true }
});

export default PasswordReset;
