import { z } from "zod";
const farmAreaAcresSchema = z.preprocess(
  (value) => value === "" || value === undefined ? null : value,
  z.union([z.number(), z.string()]).nullable()
    .transform((value) => value === null ? null : String(value).trim())
    .refine((value) => {
      if (value === null) return true;
      if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return false;
      const area = Number(value);
      return Number.isFinite(area) && area > 0 && area <= 99999999.99;
    }, "Area must be a positive number with up to 2 decimal places")
    .transform((value) => value === null ? null : Number(value)),
);

function optionalFarmText(maximumLength: number) {
  return z.string().trim().max(maximumLength).optional()
    .transform((value) => value || null);
}

export const farmCreateSchema = z.object({
  farmName: z.string().trim().min(1, "Farm name is required").max(100),
  location: optionalFarmText(200),
  areaAcres: farmAreaAcresSchema,
  soilType: optionalFarmText(100),
  irrigationType: optionalFarmText(100),
}).strict();

export type FarmCreateInput = z.infer<typeof farmCreateSchema>;
