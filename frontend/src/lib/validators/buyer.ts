import { z } from "zod";
import {
  parseDateOnly,
  parsePostgresNumeric,
  parsePositiveBigintId,
} from "@/lib/validators/database";

export const buyerProfileSchema = z.object({
  fullName: z.string().trim().min(2, "Name must contain at least 2 characters").max(100),
  email: z.string().trim().email("Enter a valid email address").toLowerCase(),
  phone: z.string().trim().min(10, "Enter a valid phone number").max(15),
  businessName: z.string().trim().min(2).max(120),
  address: z.string().trim().min(5).max(250),
  preferredMarket: z.string().trim().min(2).max(100).optional(),
});

export const buyerDemandSchema = z.object({
  cropId: z.string().trim().refine((value) => parsePositiveBigintId(value) !== null, "Crop is required"),
  cropName: z.string().trim().min(2).max(100),
  requiredQuantityKg: z.union([z.number(), z.string()])
    .transform((value) => parsePostgresNumeric(value, 12, 3, true))
    .refine((value) => value !== null, "Quantity must be positive with up to 3 decimal places and fit NUMERIC(12,3)"),
  minimumGrade: z.enum(["A", "B", "C"]),
  maxPricePerKg: z.union([z.number(), z.string()]).nullable().optional()
    .refine((value) => value == null || parsePostgresNumeric(value, 12, 2, false) !== null,
      "Maximum price must fit NUMERIC(12,2)"),
  requiredBy: z.string().nullable().optional()
    .refine((value) => value == null || parseDateOnly(value) !== null, "Enter a valid calendar date"),
  deliveryLocation: z.string().trim().min(3).max(200),
  notes: z.string().trim().max(500).optional(),
});

export type BuyerProfileInput = z.infer<typeof buyerProfileSchema>;
export type BuyerDemandInput = z.infer<typeof buyerDemandSchema>;
