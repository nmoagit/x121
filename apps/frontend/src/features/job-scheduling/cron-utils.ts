/**
 * Cron expression parsing and description utilities (PRD-119).
 *
 * Pure functions for parsing 5-field cron expressions, generating
 * human-readable descriptions, and computing next run times.
 */

import { DAY_NAMES } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const CRON_MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/* --------------------------------------------------------------------------
   Parsing
   -------------------------------------------------------------------------- */

interface CronParts {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
}

function parseCron(expr: string): CronParts | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  return {
    minute: parts[0]!,
    hour: parts[1]!,
    dayOfMonth: parts[2]!,
    month: parts[3]!,
    dayOfWeek: parts[4]!,
  };
}

/* --------------------------------------------------------------------------
   Human-readable description
   -------------------------------------------------------------------------- */

/** Generate a human-readable description of a cron expression. */
export function describeCron(expr: string): string {
  const parts = parseCron(expr);
  if (!parts) return "Invalid cron expression";

  const { minute, hour, dayOfMonth, month, dayOfWeek } = parts;
  const timeStr = formatCronTime(hour, minute);
  const dayStr = formatCronDayOfWeek(dayOfWeek);
  const monthStr = formatCronMonth(month);
  const domStr = formatCronDayOfMonth(dayOfMonth);

  if (dayOfWeek !== "*" && dayOfWeek !== "?") {
    return `${dayStr} at ${timeStr}${monthStr}`;
  }
  if (dayOfMonth !== "*" && dayOfMonth !== "?") {
    return `On day ${domStr} at ${timeStr}${monthStr}`;
  }
  if (hour !== "*" && minute !== "*") {
    return `Every day at ${timeStr}${monthStr}`;
  }
  if (hour === "*" && minute !== "*") {
    return `Every hour at minute ${minute}${monthStr}`;
  }
  return `Every minute${monthStr}`;
}

function formatCronTime(hour: string, minute: string): string {
  if (hour === "*") return `*:${minute.padStart(2, "0")}`;
  const h = parseInt(hour, 10);
  const m = parseInt(minute, 10);
  if (isNaN(h) || isNaN(m)) return `${hour}:${minute}`;
  const period = h >= 12 ? "PM" : "AM";
  const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayHour}:${String(m).padStart(2, "0")} ${period}`;
}

function formatCronDayOfWeek(dow: string): string {
  if (dow === "*" || dow === "?") return "";
  const days = dow.split(",").map((d) => {
    const num = parseInt(d, 10);
    return isNaN(num) ? d : (DAY_NAMES[num] ?? d);
  });
  if (days.length === 1) return `Every ${days[0]}`;
  return `Every ${days.join(", ")}`;
}

function formatCronMonth(month: string): string {
  if (month === "*") return "";
  const num = parseInt(month, 10);
  const name = isNaN(num) ? month : (CRON_MONTH_NAMES[num - 1] ?? month);
  return ` in ${name}`;
}

function formatCronDayOfMonth(dom: string): string {
  if (dom === "*" || dom === "?") return "";
  return dom;
}

/* --------------------------------------------------------------------------
   Next run computation
   -------------------------------------------------------------------------- */

/** Compute next N approximate run times from a cron expression. */
export function computeNextRuns(expr: string, count: number): Date[] {
  const parts = parseCron(expr);
  if (!parts) return [];

  const runs: Date[] = [];
  const candidate = new Date();
  candidate.setSeconds(0, 0);

  const maxIterations = 365 * 24 * 60;

  for (let i = 0; i < maxIterations && runs.length < count; i++) {
    candidate.setMinutes(candidate.getMinutes() + 1);
    if (matchesCron(parts, candidate)) {
      runs.push(new Date(candidate));
    }
  }

  return runs;
}

function matchesCron(parts: CronParts, date: Date): boolean {
  return (
    matchesField(parts.minute, date.getMinutes()) &&
    matchesField(parts.hour, date.getHours()) &&
    matchesField(parts.dayOfMonth, date.getDate()) &&
    matchesField(parts.month, date.getMonth() + 1) &&
    matchesDow(parts.dayOfWeek, date.getDay())
  );
}

function matchesField(field: string, value: number): boolean {
  if (field === "*" || field === "?") return true;

  return field.split(",").some((part) => {
    if (part.includes("/")) {
      const [range, stepStr] = part.split("/");
      const step = parseInt(stepStr!, 10);
      if (isNaN(step)) return false;
      if (range === "*") return value % step === 0;
      const start = parseInt(range!, 10);
      return !isNaN(start) && value >= start && (value - start) % step === 0;
    }

    if (part.includes("-")) {
      const [startStr, endStr] = part.split("-");
      const start = parseInt(startStr!, 10);
      const end = parseInt(endStr!, 10);
      return !isNaN(start) && !isNaN(end) && value >= start && value <= end;
    }

    return parseInt(part, 10) === value;
  });
}

function matchesDow(field: string, value: number): boolean {
  if (field === "*" || field === "?") return true;
  return matchesField(field, value);
}
