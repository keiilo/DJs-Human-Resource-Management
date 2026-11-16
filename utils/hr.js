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
