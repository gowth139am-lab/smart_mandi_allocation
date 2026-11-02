import { z } from "zod";

export const buyerProfileSchema = z.object({
  fullName: z.string().trim().min(2, "Name must contain at least 2 characters").max(100),
  email: z.string().trim().email("Enter a valid email address").toLowerCase(),
  phone: z.string().trim().min(10, "Enter a valid phone number").max(15),
  businessName: z.string().trim().min(2).max(120),
  address: z.string().trim().min(5).max(250),
  preferredMarket: z.string().trim().min(2).max(100).optional(),
});

export const buyerDemandSchema = z.object({
  cropId: z.string().trim().min(1, "Crop is required"),
  cropName: z.string().trim().min(2).max(100),
  requiredQuantityKg: z.number().positive("Quantity must be greater than zero"),
  minimumGrade: z.enum(["A", "B", "C"]),
  maxPricePerKg: z.number().positive("Maximum price must be greater than zero"),
  requiredBy: z.iso.datetime().optional(),
  deliveryLocation: z.string().trim().min(3).max(200),
  notes: z.string().trim().max(500).optional(),
});

export type BuyerProfileInput = z.infer<typeof buyerProfileSchema>;
export type BuyerDemandInput = z.infer<typeof buyerDemandSchema>;
