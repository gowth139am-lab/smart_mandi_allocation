const POSTGRES_BIGINT_MAX = "9223372036854775807";

export function parsePositiveBigintId(value: unknown): string | null {
  let text: string;
  if (typeof value === "string") {
    text = value;
  } else if (typeof value === "number" && Number.isSafeInteger(value)) {
    text = String(value);
  } else {
    return null;
  }

  if (!/^[1-9]\d{0,18}$/.test(text)) return null;
  if (
    text.length > POSTGRES_BIGINT_MAX.length ||
    (text.length === POSTGRES_BIGINT_MAX.length && text > POSTGRES_BIGINT_MAX)
  ) {
    return null;
  }
  return text;
}

export function parseDateOnly(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return null;

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ][month - 1];
  return day <= daysInMonth ? value : null;
}

export function parsePostgresNumeric(
  value: unknown,
  precision: number,
  scale: number,
  requirePositive: boolean,
): string | null {
  if (
    !Number.isInteger(precision) ||
    !Number.isInteger(scale) ||
    precision <= 0 ||
    scale < 0 ||
    scale >= precision
  ) {
    throw new Error("Invalid PostgreSQL numeric precision or scale");
  }

  if (
    typeof value !== "string" &&
    (typeof value !== "number" || !Number.isFinite(value))
  ) {
    return null;
  }

  const text = String(value).trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) return null;

  const integerPart = match[1].replace(/^0+(?=\d)/, "");
  const fractionPart = match[2] ?? "";
  if (integerPart.length > precision - scale || fractionPart.length > scale) {
    return null;
  }

  if (requirePositive) {
    if (integerPart === "0" && !/[1-9]/.test(fractionPart)) return null;
  }

  return `${integerPart}${fractionPart ? `.${fractionPart}` : ""}`;
}
