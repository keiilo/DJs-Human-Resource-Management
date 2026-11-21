import bcrypt from "bcrypt";
import { Op } from "sequelize";
import { User, Employee, PasswordReset } from "../models/index.js";
import { asyncHandler, parseId, paginate } from "../utils/helpers.js";
import { openResetRequests } from "./passwordResetController.js";

const ROLES = ["admin", "staff", "employee"];
const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

// Employees that no account is linked to yet.
const findFreeEmployees = async () => {
  const linked = await User.findAll({
    attributes: ["employeeId"],
    where: { employeeId: { [Op.ne]: null } },
    raw: true
  });
  const linkedIds = linked.map((row) => row.employeeId);
  return Employee.findAll({
    attributes: ["id", "firstName", "lastName", "employeeCode"],
    where: linkedIds.length ? { id: { [Op.notIn]: linkedIds } } : {},
    order: [["lastName", "ASC"], ["firstName", "ASC"]]
  });
};

export const userList = asyncHandler(async (req, res) => {
  const [users, freeEmployees, resetRequests] = await Promise.all([
    User.findAll({
      include: [{ model: Employee, as: "employee", attributes: ["id", "firstName", "lastName", "employeeCode"] }],
      order: [["id", "ASC"]]
    }),
    findFreeEmployees(),
    openResetRequests()
  ]);
  // Shown once, right after "Generate link" (see passwordResetController.issueResetLink).
  const resetLink = req.flash("reset_link").pop() || null;
  const resetEmail = req.flash("reset_email").pop() || null;

  const { rows, pagination } = paginate(req, users.map((u) => u.toJSON()));

  res.render("users", {
    title: "User Accounts | DJs HRMS",
    users: rows,
    pagination,
    freeEmployees: freeEmployees.map((e) => e.toJSON()),
    roles: ROLES,
    resetRequests,
    resetLink,
    resetEmail
  });
});

export const createUser = asyncHandler(async (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const role = ROLES.includes(req.body.role) ? req.body.role : "employee";
  const password = String(req.body.password || "");

  const errors = [];
  if (name.length < 2) errors.push("Enter the account holder's full name.");
  if (!isEmail(email)) errors.push("Enter a valid email address.");
  if (password.length < 8) errors.push("The temporary password must be at least 8 characters.");

  if (email && (await User.findOne({ where: { email }, order: [["id", "ASC"]] }))) {
    errors.push("An account with this email already exists.");
  }

  if (errors.length) {
    req.flash("error_msg", errors.join(" "));
    return res.redirect("/users");
  }

  // An admin-created account may be linked to the employee with the same email,
  // but only when that employee has no account yet.
  const employee = await Employee.findOne({ where: { email }, order: [["id", "ASC"]] });
  const employeeTaken = employee ? await User.findOne({ where: { employeeId: employee.id } }) : null;
  const linkTo = employee && !employeeTaken ? employee : null;

  await User.create({
    name,
    email,
    role,
    password: await bcrypt.hash(password, 10),
    employeeId: linkTo ? linkTo.id : null
  });

  const linkNote = linkTo
    ? ` Linked to ${linkTo.firstName} ${linkTo.lastName}.`
    : " Not linked to an employee yet; use Manage > Link to employee.";
  req.flash(
    "success_msg",
    `Account created for ${email}.${linkNote} Share the temporary password securely; the user can change it from My Profile.`
  );
  res.redirect("/users");
});

export const linkUserEmployee = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const user = id ? await User.findByPk(id) : null;

  if (!user) {
    req.flash("error_msg", "Account not found.");
    return res.redirect("/users");
  }

  const raw = String(req.body.employeeId ?? "").trim();

  if (raw === "") {
    if (!user.employeeId) {
      req.flash("success_msg", `${user.name} is not linked to an employee.`);
      return res.redirect("/users");
    }
    await user.update({ employeeId: null });
    req.flash("success_msg", `${user.name} is no longer linked to an employee record.`);
    return res.redirect("/users");
  }

  const employeeId = parseId(raw);
  const employee = employeeId ? await Employee.findByPk(employeeId) : null;
  if (!employee) {
    req.flash("error_msg", "Select a valid employee.");
    return res.redirect("/users");
  }

  if (user.employeeId === employee.id) {
    req.flash("success_msg", `${user.name} is already linked to ${employee.firstName} ${employee.lastName}.`);
    return res.redirect("/users");
  }

  const other = await User.findOne({ where: { employeeId: employee.id, id: { [Op.ne]: user.id } } });
  if (other) {
    req.flash(
      "error_msg",
      `${employee.firstName} ${employee.lastName} is already linked to ${other.email}. Unlink that account first.`
    );
    return res.redirect("/users");
  }

  await user.update({ employeeId: employee.id });
  req.flash("success_msg", `${user.name} is now linked to ${employee.firstName} ${employee.lastName}.`);
  res.redirect("/users");
});

export const resetUserPassword = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id);
  const password = String(req.body.newPassword || "");

  if (!user) {
    req.flash("error_msg", "Account not found.");
    return res.redirect("/users");
  }

  if (password.length < 8) {
    req.flash("error_msg", "The new password must be at least 8 characters.");
    return res.redirect("/users");
  }

  await user.update({ password: await bcrypt.hash(password, 10) });
  // A forgot-password request for this account is answered by this reset.
  await PasswordReset.update(
    { status: "Used", usedAt: new Date(), tokenHash: null },
    { where: { userId: user.id, status: { [Op.in]: ["Pending", "Issued"] } } }
  );
  req.flash("success_msg", `Password reset for ${user.email}.`);
  res.redirect("/users");
});

export const updateUserRole = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id);
  const role = ROLES.includes(req.body.role) ? req.body.role : null;

  if (!user) {
    req.flash("error_msg", "Account not found.");
    return res.redirect("/users");
  }

  if (!role) {
    req.flash("error_msg", "Invalid role selected.");
    return res.redirect("/users");
  }

  if (user.id === req.user.id && role !== "admin") {
    req.flash("error_msg", "You cannot remove your own administrator access.");
    return res.redirect("/users");
  }

  if (user.role === "admin" && role !== "admin") {
    const admins = await User.count({ where: { role: "admin" } });
    if (admins <= 1) {
      req.flash("error_msg", "At least one administrator account is required.");
      return res.redirect("/users");
    }
  }

  await user.update({ role });
  req.flash("success_msg", `${user.name}'s role is now ${role}.`);
  res.redirect("/users");
});

export const deleteUser = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const user = id ? await User.findByPk(id) : null;

  if (!user) {
    req.flash("error_msg", "Account not found.");
    return res.redirect("/users");
  }

  if (user.id === req.user.id) {
    req.flash("error_msg", "You cannot delete your own account.");
    return res.redirect("/users");
  }

  if (user.role === "admin") {
    const admins = await User.count({ where: { role: "admin" } });
    if (admins <= 1) {
      req.flash("error_msg", "At least one administrator account is required.");
      return res.redirect("/users");
    }
  }

  await user.destroy();
  req.flash("success_msg", "Account deleted.");
  res.redirect("/users");
});
