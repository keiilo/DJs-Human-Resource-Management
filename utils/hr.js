export const LEAVE_TYPES = [
  "Vacation",
  "Sick",
  "Maternity",
  "Paternity",
  "Emergency",
  "Unpaid"
];

export const EMPLOYMENT_STATUSES = ["Active", "On Leave", "Resigned"];

export const ATTENDANCE_STATUSES = ["Present", "Late", "Absent", "Half Day"];

// Annual leave allocation (days) used for balance tracking.
export const LEAVE_ALLOCATION = {
  Vacation: 15,
  Sick: 15,
  Maternity: 105,
  Paternity: 7,
  Emergency: 5,
  Unpaid: 0
};

export const OFFICE_START_MINUTES = 8 * 60; // 08:00
export const OFFICE_END_MINUTES = 17 * 60; // 17:00
// Self check-in is open from 05:00 until the end of the shift, so a tap at midnight
// is not recorded as an on-time day.
export const CHECK_IN_OPENS_MINUTES = 5 * 60; // 05:00

const clock12 = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = String(minutes % 60).padStart(2, "0");
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h >= 12 ? "PM" : "AM"}`;
};

// Message when a self check-in at "HH:MM" is outside the check-in window, otherwise null.
export const checkInWindowProblem = (time) => {
  const [h, m] = String(time || "").split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "Could not read the current time.";
  const minutes = h * 60 + m;
  if (minutes >= CHECK_IN_OPENS_MINUTES && minutes < OFFICE_END_MINUTES) return null;
  return (
    `Check-in is open from ${clock12(CHECK_IN_OPENS_MINUTES)} to ${clock12(OFFICE_END_MINUTES)} only. ` +
    "If you worked outside these hours, ask HR to record your attendance."
  );
};

export const timeToMinutes = (value) => {
  if (!value) return null;
  const [h, m] = String(value).split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
};

export const lateMinutesFor = (checkIn) => {
  const minutes = timeToMinutes(checkIn);
  if (minutes === null) return 0;
  return Math.max(0, minutes - OFFICE_START_MINUTES);
};

// Rest days (0 = Sunday ... 6 = Saturday) from HR_REST_DAYS, e.g. "0" or "0,6". Default: Sunday.
const parseRestDays = (value) => {
  const days = String(value ?? "0")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[0-6]$/.test(s))
    .map(Number);
  return new Set(days);
};

export const REST_DAYS = parseRestDays(process.env.HR_REST_DAYS);

const parseISODate = (iso) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ""))) return null;
  const [y, m, d] = String(iso).split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toISO = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const isRestDay = (isoDate) => {
  const date = parseISODate(isoDate);
  return date ? REST_DAYS.has(date.getDay()) : false;
};

// Yields every date from start to end (inclusive) as YYYY-MM-DD.
export function* eachDay(startDate, endDate) {
  const start = parseISODate(startDate);
  const end = parseISODate(endDate);
  if (!start || !end || end < start) return;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    yield toISO(d);
  }
}

// Number of working (non-rest) days covered by a leave, both dates included.
export const leaveDays = (startDate, endDate) => {
  let count = 0;
  for (const day of eachDay(startDate, endDate)) {
    if (!isRestDay(day)) count += 1;
  }
  return count;
};

export const isValidDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
