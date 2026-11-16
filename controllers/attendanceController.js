import { Op } from "sequelize";
import { Attendance, Employee } from "../models/index.js";
import { asyncHandler, parseId, findEmployeeForUser } from "../utils/helpers.js";
import { ATTENDANCE_STATUSES, lateMinutesFor } from "../utils/hr.js";
import { localDateISO, monthEndISO } from "../utils/format.js";

const buildRow = (employee, record) => ({
  employeeId: employee.id,
  code: employee.employeeCode,
  name: `${employee.firstName} ${employee.lastName}`,
  department: employee.department,
  status: record ? record.status : "Not recorded",
  checkIn: record ? record.checkIn : null,
  checkOut: record ? record.checkOut : null,
  lateMinutes: record ? record.lateMinutes : 0,
  remarks: record ? record.remarks : null,
  recordId: record ? record.id : null
});

const ATTENDANCE_PAGE_SIZE = 9;

// /attendance link that keeps the selected date, department and page.
const attendanceUrl = (date, department = "", page = 1) => {
  const params = new URLSearchParams({ date });
  if (department) params.set("department", department);
  if (page > 1) params.set("page", String(page));
  return `/attendance?${params.toString()}`;
};

export const attendanceIndex = asyncHandler(async (req, res) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || "") ? req.query.date : localDateISO();
  const department = String(req.query.department || "").trim();
  const requestedPage = Math.max(1, parseInt(req.query.page, 10) || 1);

  const where = { status: ["Active", "On Leave"] };
  if (department) where.department = department;

  const [employees, records] = await Promise.all([
    Employee.findAll({ where, order: [["lastName", "ASC"]] }),
    Attendance.findAll({ where: { date } })
  ]);

  const recordMap = new Map(records.map((r) => [r.employeeId, r]));
  const rows = employees.map((e) => buildRow(e, recordMap.get(e.id)));

  const summary = {
    total: rows.length,
    present: rows.filter((r) => r.status === "Present").length,
    late: rows.filter((r) => r.status === "Late").length,
    absent: rows.filter((r) => r.status === "Absent").length,
    unrecorded: rows.filter((r) => r.status === "Not recorded").length
  };

  // The summary counts every employee; the table shows ATTENDANCE_PAGE_SIZE per page.
  const totalPages = Math.max(1, Math.ceil(rows.length / ATTENDANCE_PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const start = (page - 1) * ATTENDANCE_PAGE_SIZE;
  const pageRows = rows.slice(start, start + ATTENDANCE_PAGE_SIZE);
  const pagination = {
    page,
    totalPages,
    count: rows.length,
    from: rows.length ? start + 1 : 0,
    to: start + pageRows.length,
    hasPrev: page > 1,
    hasNext: page < totalPages,
    prevUrl: attendanceUrl(date, department, page - 1),
    nextUrl: attendanceUrl(date, department, page + 1),
    pages: Array.from({ length: totalPages }, (_, i) => ({
      number: i + 1,
      url: attendanceUrl(date, department, i + 1),
      current: i + 1 === page
    }))
  };

  res.render("attendance", {
    title: "Attendance | DJs HRMS",
    date,
    department,
    rows: pageRows,
    pagination,
    summary,
    statuses: ATTENDANCE_STATUSES,
    departments: await Employee.findAll({
      attributes: ["department"],
      group: ["department"],
      raw: true
    }).then((list) => [...new Set(list.map((r) => r.department).filter(Boolean))].sort())
  });
});

export const recordAttendance = asyncHandler(async (req, res) => {
  const employeeId = parseId(req.body.employeeId);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.body.date || "") ? req.body.date : localDateISO();
  const employee = employeeId ? await Employee.findByPk(employeeId) : null;
  // Return to the same filter and page the Edit modal was opened from.
  const backUrl = attendanceUrl(
    date,
    String(req.body.department || "").trim(),
    Math.max(1, parseInt(req.body.page, 10) || 1)
  );

  if (!employee) {
    req.flash("error_msg", "Select a valid employee.");
    return res.redirect(backUrl);
  }

  const checkIn = String(req.body.checkIn || "").trim() || null;
  const checkOut = String(req.body.checkOut || "").trim() || null;
  const requestedStatus = ATTENDANCE_STATUSES.includes(req.body.status) ? req.body.status : null;
  const lateMinutes = checkIn ? lateMinutesFor(checkIn) : 0;

  let status = requestedStatus;
  if (!status) status = !checkIn ? "Absent" : lateMinutes > 0 ? "Late" : "Present";
  if (status === "Absent") status = "Absent";

  const payload = {
    employeeId,
    date,
    checkIn,
    checkOut,
    status,
    lateMinutes: status === "Absent" ? 0 : lateMinutes,
    remarks: String(req.body.remarks || "").trim() || null
  };

  const existing = await Attendance.findOne({ where: { employeeId, date } });
  if (existing) {
    await existing.update(payload);
    req.flash("success_msg", `Attendance updated for ${employee.firstName} ${employee.lastName}.`);
  } else {
    await Attendance.create(payload);
    req.flash("success_msg", `Attendance recorded for ${employee.firstName} ${employee.lastName}.`);
  }

  res.redirect(backUrl);
});

export const checkIn = asyncHandler(async (req, res) => {
  const employee = await findEmployeeForUser(req.user);

  if (!employee) {
    req.flash("error_msg", "No employee record is linked to your account. Please contact HR.");
    return res.redirect("/dashboard");
  }

  const date = localDateISO();
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const existing = await Attendance.findOne({ where: { employeeId: employee.id, date } });
  if (existing && existing.checkIn) {
    req.flash("error_msg", "You have already checked in today.");
    return res.redirect("/my-attendance");
  }

  const lateMinutes = lateMinutesFor(time);
  const payload = {
    checkIn: time,
    checkOut: existing ? existing.checkOut : null,
    status: lateMinutes > 0 ? "Late" : "Present",
    lateMinutes
  };

  if (existing) await existing.update(payload);
  else await Attendance.create({ employeeId: employee.id, date, ...payload });

  req.flash("success_msg", `Checked in at ${time}${lateMinutes > 0 ? ` (${lateMinutes} minutes late)` : ""}.`);
  res.redirect("/my-attendance");
});

export const checkOut = asyncHandler(async (req, res) => {
  const employee = await findEmployeeForUser(req.user);

  if (!employee) {
    req.flash("error_msg", "No employee record is linked to your account. Please contact HR.");
    return res.redirect("/dashboard");
  }

  const date = localDateISO();
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const record = await Attendance.findOne({ where: { employeeId: employee.id, date } });
  if (!record || !record.checkIn) {
    req.flash("error_msg", "You need to check in before checking out.");
    return res.redirect("/my-attendance");
  }

  await record.update({ checkOut: time });
  req.flash("success_msg", `Checked out at ${time}.`);
  res.redirect("/my-attendance");
});

export const myAttendance = asyncHandler(async (req, res) => {
  const employee = await findEmployeeForUser(req.user);

  if (!employee) {
    return res.render("my-attendance", {
      title: "My Attendance | DJs HRMS",
      employee: null,
      rows: [],
      summary: null,
      month: ""
    });
  }

  const month = /^\d{4}-\d{2}$/.test(req.query.month || "")
    ? req.query.month
    : localDateISO().slice(0, 7);
  const from = `${month}-01`;
  const to = monthEndISO(month);

  const records = await Attendance.findAll({
    where: { employeeId: employee.id, date: { [Op.between]: [from, to] } },
    order: [["date", "DESC"]]
  });

  const rows = records.map((r) => r.toJSON());
  const summary = {
    present: rows.filter((r) => r.status === "Present").length,
    late: rows.filter((r) => r.status === "Late").length,
    absent: rows.filter((r) => r.status === "Absent").length,
    halfDay: rows.filter((r) => r.status === "Half Day").length,
    totalLateMinutes: rows.reduce((sum, r) => sum + Number(r.lateMinutes || 0), 0)
  };

  res.render("my-attendance", {
    title: "My Attendance | DJs HRMS",
    employee: employee.toJSON(),
    rows,
    summary,
    month
  });
});
