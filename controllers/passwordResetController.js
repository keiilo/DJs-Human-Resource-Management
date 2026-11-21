/*
  Forgot password, handled through the administrator (no e-mail server needed):
    1. The user enters their email on /forgot-password            -> request is Pending
    2. An admin opens User Accounts and clicks "Generate link"    -> request is Issued
       The link holds a random 64-character token and works once, for 30 minutes.
       Only the SHA-256 hash of the token is saved, so the database never holds a usable link.
    3. The user opens the link and sets a new password            -> request is Used
       The new password is saved as a bcrypt hash, like every other password.
*/
import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { Op } from "sequelize";
import { sequelize, User, PasswordReset } from "../models/index.js";
import { asyncHandler, parseId } from "../utils/helpers.js";

export const RESET_LINK_MINUTES = 30;

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
const isToken = (value) => /^[a-f0-9]{64}$/.test(value);

// The Issued request a link token belongs to, or null when it is wrong, used or expired.
const findUsableReset = async (token) => {
  if (!isToken(token)) return null;
  return PasswordReset.findOne({
    where: {
      tokenHash: hashToken(token),
      status: "Issued",
      expiresAt: { [Op.gt]: new Date() }
    },
    include: [{ model: User, as: "user", attributes: ["id", "name", "email"] }]
  });
};

// ---- Public pages ---------------------------------------------------------------------------

export const forgotPasswordPage = (req, res) => {
  res.render("forgotpassword", { title: "Forgot Password | DJs HRMS" });
};

export const forgotPasswordRequest = asyncHandler(async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    req.flash("error_msg", "Enter the email address you sign in with.");
    return res.redirect("/forgot-password");
  }

  const user = await User.findOne({ where: { email }, order: [["id", "ASC"]] });
  if (user) {
    // One open request per account: asking again only refreshes it.
    const open = await PasswordReset.findOne({
      where: { userId: user.id, status: { [Op.in]: ["Pending", "Issued"] } },
      order: [["id", "DESC"]]
    });
    if (open) {
      open.changed("updatedAt", true);
      await open.save();
    } else {
      await PasswordReset.create({ userId: user.id });
    }
  }

  // Same answer whether or not the email exists, so accounts cannot be discovered here.
  req.flash(
    "success_msg",
    "Request sent. If the email belongs to an account, the HR administrator will give you a reset link."
  );
  res.redirect("/forgot-password");
});

export const resetPasswordPage = asyncHandler(async (req, res) => {
  const reset = await findUsableReset(String(req.params.token || ""));
  res.render("reset-password", {
    title: "Reset Password | DJs HRMS",
    valid: Boolean(reset),
    token: reset ? req.params.token : null,
    account: reset ? reset.user.toJSON() : null
  });
});

export const resetPasswordSubmit = asyncHandler(async (req, res) => {
  const token = String(req.params.token || "");
  const password = String(req.body.password || "");
  const confirmation = String(req.body.confirmPassword || "");

  const reset = await findUsableReset(token);
  if (!reset) {
    req.flash("error_msg", "This reset link is invalid, already used or expired. Ask HR for a new one.");
    return res.redirect("/forgot-password");
  }

  const errors = [];
  if (password.length < 8) errors.push("Password must be at least 8 characters long.");
  if (password !== confirmation) errors.push("Passwords do not match.");
  if (errors.length) {
    req.flash("error_msg", errors.join(" "));
    return res.redirect(`/reset-password/${token}`);
  }

  const hashed = await bcrypt.hash(password, 10);
  await sequelize.transaction(async (transaction) => {
    await User.update({ password: hashed }, { where: { id: reset.userId }, transaction });
    await reset.update({ status: "Used", usedAt: new Date(), tokenHash: null }, { transaction });
    // Any other open request for the same account is closed too.
    await PasswordReset.update(
      { status: "Dismissed", tokenHash: null },
      { where: { userId: reset.userId, status: { [Op.in]: ["Pending", "Issued"] } }, transaction }
    );
  });

  req.flash("success_msg", "Your password was changed. Sign in with your new password.");
  res.redirect("/login");
});

// ---- Administrator (User Accounts page) -----------------------------------------------------

// Open requests for the User Accounts page, newest first.
export const openResetRequests = async () => {
  const rows = await PasswordReset.findAll({
    where: { status: { [Op.in]: ["Pending", "Issued"] } },
    include: [{ model: User, as: "user", attributes: ["id", "name", "email", "role"] }],
    order: [["updatedAt", "DESC"]]
  });
  const now = Date.now();
  return rows
    .filter((row) => row.user)
    .map((row) => ({
      ...row.toJSON(),
      expired: row.status === "Issued" && row.expiresAt && row.expiresAt.getTime() <= now
    }));
};

export const issueResetLink = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const reset = id
    ? await PasswordReset.findByPk(id, { include: [{ model: User, as: "user", attributes: ["email"] }] })
    : null;

  if (!reset || !reset.user || !["Pending", "Issued"].includes(reset.status)) {
    req.flash("error_msg", "That password request is no longer open.");
    return res.redirect("/users");
  }

  // A new link replaces any earlier one for this request.
  const token = crypto.randomBytes(32).toString("hex");
  await reset.update({
    status: "Issued",
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + RESET_LINK_MINUTES * 60 * 1000)
  });

  // The plain link is shown to the admin once (flash) and is never stored.
  req.flash("reset_link", `${req.protocol}://${req.get("host")}/reset-password/${token}`);
  req.flash("reset_email", reset.user.email);
  req.flash("success_msg", `Reset link created for ${reset.user.email}. It works once, for ${RESET_LINK_MINUTES} minutes.`);
  res.redirect("/users");
});

export const dismissResetRequest = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const reset = id ? await PasswordReset.findByPk(id) : null;

  if (!reset || !["Pending", "Issued"].includes(reset.status)) {
    req.flash("error_msg", "That password request is no longer open.");
    return res.redirect("/users");
  }

  await reset.update({ status: "Dismissed", tokenHash: null });
  req.flash("success_msg", "Password request dismissed. Its link no longer works.");
  res.redirect("/users");
});
