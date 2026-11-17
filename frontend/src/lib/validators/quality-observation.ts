const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATETIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

export const VALID_QUALITY_GRADES = new Set(["A", "B", "C"]);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function isMeasurementRecord(value: unknown): value is Record<string, string | number> {
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  return entries.length > 0 && entries.length <= 32 && entries.every(([key, measurement]) =>
    /^[A-Za-z][A-Za-z0-9_-]{0,49}$/.test(key) &&
    ((typeof measurement === "number" && Number.isFinite(measurement)) ||
      (typeof measurement === "string" && measurement.trim().length > 0 && measurement.length <= 200)),
  );
}

function isValidCalendarDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function parseInspectionDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const match = DATE_ONLY_PATTERN.exec(value) ?? ISO_DATETIME_PATTERN.exec(value);
  if (!match || !isValidCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]))) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
