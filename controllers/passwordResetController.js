/*
  Forgot password, approved by the administrator (no e-mail server needed):
    1. The user enters their email on /forgot-password. The page then shows
       "Waiting for HR approval" and checks every few seconds.
       The browser keeps a random secret in a cookie (only its SHA-256 hash is in the database),
       so only the browser that sent the request can continue after approval.
    2. The admin is notified (dashboard bell + User Accounts > Password Requests) and clicks Approve.
    3. The waiting page notices the approval and opens "Set a new password" by itself.
       The new password is saved as a bcrypt hash.
  If the user closed the waiting page, the admin can send a copyable one-time link instead.
  Approvals and links work once and only for 30 minutes.
*/
import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { Op } from "sequelize";
import { sequelize, User, PasswordReset } from "../models/index.js";
import { asyncHandler, parseId } from "../utils/helpers.js";

export const RESET_LINK_MINUTES = 30;
const WAIT_COOKIE = "hr_pw_reset";

const sha256 = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
const isToken = (value) => /^[a-f0-9]{64}$/.test(value);
const minutesFromNow = (minutes) => new Date(Date.now() + minutes * 60 * 1000);

// ---- The waiting browser's cookie: { id, claim, email, until } -----------------------------
// Kept in a cookie (not the server session) so it survives a server restart.

const readWaiting = (req) => {
  const raw = String(req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${WAIT_COOKIE}=`));
  if (!raw) return null;
  try {
    const data = JSON.parse(Buffer.from(decodeURIComponent(raw.slice(WAIT_COOKIE.length + 1)), "base64url").toString());
    if (!data || !isToken(data.claim) || !(data.until > Date.now())) return null;
    return data;
  } catch {
    return null;
  }
};

const writeWaiting = (res, data) =>
  res.cookie(WAIT_COOKIE, Buffer.from(JSON.stringify(data)).toString("base64url"), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: RESET_LINK_MINUTES * 60 * 1000,
    path: "/"
  });

const clearWaiting = (res) => res.clearCookie(WAIT_COOKIE, { path: "/" });

// ---- Tokens ---------------------------------------------------------------------------------

// The request a "Set a new password" token belongs to, or null when wrong, used or expired.
const findUsableReset = async (token) => {
  if (!isToken(token)) return null;
  return PasswordReset.findOne({
    where: { tokenHash: sha256(token), status: "Issued", expiresAt: { [Op.gt]: new Date() } },
    include: [{ model: User, as: "user", attributes: ["id", "name", "email"] }]
  });
};

// Gives a request a fresh one-time token and returns the plain token (never stored).
const issueToken = async (reset, extra = {}) => {
  const token = crypto.randomBytes(32).toString("hex");
  await reset.update({
    status: "Issued",
    tokenHash: sha256(token),
    expiresAt: minutesFromNow(RESET_LINK_MINUTES),
    ...extra
  });
  return token;
};

// ---- Public pages ---------------------------------------------------------------------------

export const forgotPasswordPage = (req, res) => {
  const waiting = readWaiting(req);
  if (waiting) {
    return res.render("forgotpassword", {
      title: "Waiting for HR | DJs HRMS",
      waiting: true,
      email: waiting.email
    });
  }
  res.render("forgotpassword", { title: "Forgot Password | DJs HRMS", waiting: false });
};

export const forgotPasswordRequest = asyncHandler(async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    req.flash("error_msg", "Enter the email address you sign in with.");
    return res.redirect("/forgot-password");
  }

  const claim = crypto.randomBytes(32).toString("hex");
  let requestId = 0;

  const user = await User.findOne({ where: { email }, order: [["id", "ASC"]] });
  if (user) {
    // One open request per account: asking again starts it over (and the older browser stops).
    const fresh = {
      status: "Pending",
      claimHash: sha256(claim),
      codeHash: null,
      codeAttempts: 0,
      tokenHash: null,
      expiresAt: null,
      approvedAt: null
    };
    const open = await PasswordReset.findOne({
      where: { userId: user.id, status: { [Op.in]: ["Pending", "Issued"] } },
      order: [["id", "DESC"]]
    });
    const reset = open ? await open.update(fresh) : await PasswordReset.create({ userId: user.id, ...fresh });
    requestId = reset.id;
  }

  // The page looks the same whether or not the email has an account (it simply never gets
  // approved), so accounts cannot be discovered here.
  writeWaiting(res, { id: requestId, claim, email, until: Date.now() + RESET_LINK_MINUTES * 60 * 1000 });
  res.redirect("/forgot-password");
});

// GET /forgot-password/status (polled by the waiting page)
export const forgotPasswordStatus = asyncHandler(async (req, res) => {
  res.set("Cache-Control", "no-store");
  const waiting = readWaiting(req);
  if (!waiting) {
    clearWaiting(res);
    return res.json({ status: "expired" });
  }
  if (!waiting.id) return res.json({ status: "pending" });

  const reset = await PasswordReset.findOne({ where: { id: waiting.id, claimHash: sha256(waiting.claim) } });
  if (!reset || reset.status === "Dismissed") {
    clearWaiting(res);
    return res.json({ status: "dismissed" });
  }
  if (reset.status === "Used") {
    clearWaiting(res);
    return res.json({ status: "done" });
  }

  // Approved by the administrator: this browser gets its own one-time page, once.
  if (reset.status === "Issued" && reset.approvedAt && reset.expiresAt > new Date()) {
    const token = await issueToken(reset, { claimHash: null, expiresAt: reset.expiresAt });
    clearWaiting(res);
    return res.json({ status: "approved", url: `/reset-password/${token}` });
  }
  res.json({ status: "pending" });
});

// POST /forgot-password/cancel
export const forgotPasswordCancel = (req, res) => {
  clearWaiting(res);
  res.redirect("/forgot-password");
};

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
    req.flash("error_msg", "This reset link is invalid, already used or expired. Send a new request.");
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
    await reset.update({ status: "Used", usedAt: new Date(), tokenHash: null, claimHash: null }, { transaction });
    // Any other open request for the same account is closed too.
    await PasswordReset.update(
      { status: "Dismissed", tokenHash: null, claimHash: null },
      { where: { userId: reset.userId, status: { [Op.in]: ["Pending", "Issued"] } }, transaction }
    );
  });

  req.flash("success_msg", "Your password was changed. Sign in with your new password.");
  res.redirect("/login");
});

// ---- Administrator (User Accounts page, dashboard bell) -------------------------------------

// Open requests, newest first. Hashes are never sent to the views.
export const openResetRequests = async () => {
  const rows = await PasswordReset.findAll({
    where: { status: { [Op.in]: ["Pending", "Issued"] } },
    include: [{ model: User, as: "user", attributes: ["id", "name", "email", "role"] }],
    order: [["updatedAt", "DESC"]]
  });
  const now = Date.now();
  return rows
    .filter((row) => row.user)
    .map((row) => {
      const data = row.toJSON();
      const expired = row.status === "Issued" && row.expiresAt && row.expiresAt.getTime() <= now;
      for (const secret of ["tokenHash", "claimHash", "codeHash"]) delete data[secret];
      return {
        ...data,
        expired,
        approved: row.status === "Issued" && Boolean(row.approvedAt) && !expired,
        linkGiven: row.status === "Issued" && !row.approvedAt && !expired,
        // Approve needs the user's browser to be waiting (it holds the secret).
        canApprove: row.status === "Pending" && Boolean(row.claimHash)
      };
    });
};

const findOpenRequest = async (req, res) => {
  const id = parseId(req.params.id);
  const reset = id
    ? await PasswordReset.findByPk(id, { include: [{ model: User, as: "user", attributes: ["email"] }] })
    : null;
  if (!reset || !reset.user || !["Pending", "Issued"].includes(reset.status)) {
    req.flash("error_msg", "That password request is no longer open.");
    res.redirect("/users#password-requests");
    return null;
  }
  return reset;
};

// POST /password-requests/:id/approve
export const approveResetRequest = asyncHandler(async (req, res) => {
  const reset = await findOpenRequest(req, res);
  if (!reset) return;

  if (reset.status !== "Pending" || !reset.claimHash) {
    req.flash("error_msg", "Nobody is waiting on this request any more. Use \"Send link instead\".");
    return res.redirect("/users#password-requests");
  }

  // The token itself is created when the waiting browser checks in (it never passes through here).
  await reset.update({
    status: "Issued",
    approvedAt: new Date(),
    expiresAt: minutesFromNow(RESET_LINK_MINUTES),
    tokenHash: null
  });
  req.flash("success_msg", `Approved. ${reset.user.email} is now taken to "Set a new password" on their screen.`);
  res.redirect("/users#password-requests");
});

// POST /password-requests/:id/issue  (fallback: a link the admin copies and sends)
export const issueResetLink = asyncHandler(async (req, res) => {
  const reset = await findOpenRequest(req, res);
  if (!reset) return;

  const token = await issueToken(reset, { approvedAt: null, claimHash: null });

  // The plain link is shown to the admin once (flash) and is never stored.
  req.flash("reset_link", `${req.protocol}://${req.get("host")}/reset-password/${token}`);
  req.flash("reset_email", reset.user.email);
  req.flash("success_msg", `Reset link created for ${reset.user.email}. It works once, for ${RESET_LINK_MINUTES} minutes.`);
  res.redirect("/users");
});

export const dismissResetRequest = asyncHandler(async (req, res) => {
  const reset = await findOpenRequest(req, res);
  if (!reset) return;

  await reset.update({ status: "Dismissed", tokenHash: null, claimHash: null });
  req.flash("success_msg", "Password request dismissed. Its link no longer works.");
  res.redirect("/users#password-requests");
});
