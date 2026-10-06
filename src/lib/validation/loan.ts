/**
 * Loan & Item Validation Schemas
 * Non-mandatory permissive entries tailored for Indian pawn broker operations.
 */

import { z } from "zod";

export const loanItemSchema = z
  .object({
    metalType: z.enum(["GOLD", "SILVER"]).default("GOLD"),
    description: z.string().max(255).optional().default("Pledged Item"),
    purityLabel: z.string().optional().default("22K"),
    purityPercent: z.coerce
      .number()
      .gt(0, "Purity must be greater than 0")
      .lte(100, "Purity cannot exceed 100%"),
    grossWeightGrams: z.coerce.number().gt(0, "Gross weight must be greater than 0"),
    stoneWeightGrams: z.coerce.number().gte(0, "Stone weight cannot be negative").optional().default(0),
    valuationRatePerGram: z.coerce.number().gt(0, "Valuation rate must be greater than 0"),
    packetNumber: z.string().optional().default(""),
    storageLocation: z.string().optional().default("Main Safe"),
    photoUrl: z.string().url().optional().or(z.literal("")),
  })
  .refine((data) => (data.stoneWeightGrams ?? 0) < data.grossWeightGrams, {
    message: "Stone weight must be less than gross weight",
    path: ["stoneWeightGrams"],
  });

export type LoanItemInput = z.infer<typeof loanItemSchema>;

export const createLoanSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  items: z.array(loanItemSchema).min(1, "At least one item is required"),
  tenureMonths: z.coerce
    .number()
    .gte(0.5, "Tenure must be positive")
    .optional()
    .default(12),
  interestRateMonthly: z.coerce
    .number()
    .gt(0, "Interest rate must be greater than 0")
    .lte(10, "Interest rate cannot exceed 10% per month"),
  principalAmount: z.coerce.number().gt(0, "Principal amount must be greater than 0"),
  gracePeriodDays: z.coerce
    .number()
    .gte(0)
    .lte(90, "Grace period cannot exceed 90 days")
    .optional()
    .default(7),
  processingFee: z.coerce.number().gte(0).optional().default(0),
  loanType: z.enum(["STANDARD", "CUMULATIVE"]).optional().default("STANDARD"),
  cumulativeFrequency: z.enum(["MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY"]).optional(),
  cumulativeTreatment: z.enum(["ADD_TO_CAPITAL", "KEEP_SEPARATE"]).optional(),
  asDraft: z.boolean().optional(),
});

export type CreateLoanFormInput = z.infer<typeof createLoanSchema>;
