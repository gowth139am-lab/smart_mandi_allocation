import {
  parseDateOnly,
  parsePostgresNumeric,
  parsePositiveBigintId,
} from "@/lib/validators/database";

export type MarketPriceInput = {
  marketId: string;
  cropId: string;
  priceDate: string;
  minPrice: string;
  modalPrice: string;
  maxPrice: string;
  arrivalQuantity: string | null;
  source: string | null;
};

export function parseMarketPriceInput(value: unknown): MarketPriceInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const marketId = parsePositiveBigintId(data.market_id);
  const cropId = parsePositiveBigintId(data.crop_id);
  const priceDate = parseDateOnly(data.price_date);
  const minPrice = parsePostgresNumeric(data.min_price, 12, 2, false);
  const modalPrice = parsePostgresNumeric(data.modal_price, 12, 2, false);
  const maxPrice = parsePostgresNumeric(data.max_price, 12, 2, false);
  const hasArrival = data.arrival_quantity !== undefined && data.arrival_quantity !== null && data.arrival_quantity !== "";
  const arrivalQuantity = hasArrival
    ? parsePostgresNumeric(data.arrival_quantity, 12, 3, false)
    : null;
  const source = data.source == null || data.source === ""
    ? null
    : typeof data.source === "string" ? data.source.trim() : null;

  if (
    !marketId || !cropId || !priceDate ||
    minPrice === null || modalPrice === null || maxPrice === null ||
    (hasArrival && arrivalQuantity === null) ||
    (data.source != null && data.source !== "" && typeof data.source !== "string") ||
    (source !== null && source.length > 150) ||
    compareNumeric(minPrice, modalPrice) > 0 ||
    compareNumeric(modalPrice, maxPrice) > 0
  ) return null;

  return { marketId, cropId, priceDate, minPrice, modalPrice, maxPrice, arrivalQuantity, source };
}

function compareNumeric(left: string, right: string) {
  const [leftWhole, leftFraction = ""] = left.split(".");
  const [rightWhole, rightFraction = ""] = right.split(".");
  const normalizedLeft = leftWhole.replace(/^0+(?=\d)/, "");
  const normalizedRight = rightWhole.replace(/^0+(?=\d)/, "");
  if (normalizedLeft.length !== normalizedRight.length) {
    return normalizedLeft.length < normalizedRight.length ? -1 : 1;
  }
  if (normalizedLeft !== normalizedRight) return normalizedLeft < normalizedRight ? -1 : 1;
  const paddedLeft = leftFraction.padEnd(2, "0");
  const paddedRight = rightFraction.padEnd(2, "0");
  return paddedLeft === paddedRight ? 0 : paddedLeft < paddedRight ? -1 : 1;
}
