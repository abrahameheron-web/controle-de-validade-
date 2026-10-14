import { addDays, subMonths } from "date-fns";

export type ProductStatus = "normal" | "threeMonths" | "twoMonths" | "oneMonth" | "expired";

export const PRODUCT_STATUS_ORDER: ProductStatus[] = [
  "normal",
  "threeMonths",
  "twoMonths",
  "oneMonth",
  "expired",
];

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  normal: "Normal",
  threeMonths: "3 meses",
  twoMonths: "2 meses",
  oneMonth: "1 mês",
  expired: "Vencidos",
};

/** Parse a YYYY-MM-DD value as a local calendar day (not as UTC midnight). */
export function parseCalendarDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return new Date(Number.NaN);
  const [, year, month, day] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  if (
    parsed.getFullYear() !== Number(year) ||
    parsed.getMonth() !== Number(month) - 1 ||
    parsed.getDate() !== Number(day)
  ) {
    return new Date(Number.NaN);
  }
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

export function isCalendarDate(value: string): boolean {
  return !Number.isNaN(parseCalendarDate(value).getTime());
}

export function formatCalendarDate(value: string): string {
  const date = parseCalendarDate(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

export function getExpiryThresholds(expiryDate: string) {
  const expiry = parseCalendarDate(expiryDate);
  return {
    threeMonths: subMonths(expiry, 3),
    twoMonths: subMonths(expiry, 2),
    oneMonth: subMonths(expiry, 1),
  };
}

function calendarDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function getProductStatus(expiryDate: string, today = new Date()): ProductStatus {
  const expiry = parseCalendarDate(expiryDate);
  const current = calendarDay(today);
  if (Number.isNaN(expiry.getTime())) return "normal";
  if (current > expiry) return "expired";
  const thresholds = getExpiryThresholds(expiryDate);
  if (current >= thresholds.oneMonth) return "oneMonth";
  if (current >= thresholds.twoMonths) return "twoMonths";
  if (current >= thresholds.threeMonths) return "threeMonths";
  return "normal";
}

export function entersThreeMonthRangeSoon(expiryDate: string, today = new Date()): boolean {
  const threshold = getExpiryThresholds(expiryDate).threeMonths;
  const current = calendarDay(today);
  const lastAlertDay = addDays(current, 7);
  return threshold >= current && threshold <= lastAlertDay;
}

export function formatDateTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}
