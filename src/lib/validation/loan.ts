/**
 * Loan & Item Validation Schemas
 */

import { z } from "zod";

export const loanItemSchema = z
  .object({
    metalType: z.enum(["GOLD", "SILVER"]),
    description: z.string().min(1, "Item description is required").max(200),
    purityLabel: z.string().min(1, "Purity label is required"),
    purityPercent: z.coerce
      .number()
      .gt(0, "Purity must be greater than 0")
      .lte(100, "Purity cannot exceed 100%"),
    grossWeightGrams: z.coerce.number().gt(0, "Gross weight must be greater than 0"),
    stoneWeightGrams: z.coerce.number().gte(0, "Stone weight cannot be negative").default(0),
    valuationRatePerGram: z.coerce.number().gt(0, "Valuation rate must be greater than 0"),
    packetNumber: z.string().min(1, "Packet number is required"),
    storageLocation: z.string().min(1, "Storage location is required"),
    photoUrl: z.string().url().optional().or(z.literal("")),
  })
  .refine((data) => data.stoneWeightGrams < data.grossWeightGrams, {
    message: "Stone weight must be less than gross weight",
    path: ["stoneWeightGrams"],
  });

export type LoanItemInput = z.infer<typeof loanItemSchema>;

export const createLoanSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  items: z.array(loanItemSchema).min(1, "At least one item is required"),
  tenureMonths: z.coerce
    .number()
    .int()
    .gte(1, "Tenure must be at least 1 month")
    .lte(12, "Tenure cannot exceed 12 months (RBI cap)"),
  interestRateMonthly: z.coerce
    .number()
    .gt(0, "Interest rate must be greater than 0")
    .lte(10, "Interest rate cannot exceed 10% per month"),
  principalAmount: z.coerce.number().gt(0, "Principal amount must be greater than 0"),
  gracePeriodDays: z.coerce
    .number()
    .int()
    .gte(0)
    .lte(90, "Grace period cannot exceed 90 days")
    .default(7),
  processingFee: z.coerce.number().gte(0).optional(),
  loanType: z.enum(["STANDARD", "CUMULATIVE"]).default("STANDARD"),
  cumulativeFrequency: z.enum(["MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY"]).optional(),
  cumulativeTreatment: z.enum(["ADD_TO_CAPITAL", "KEEP_SEPARATE"]).optional(),
  asDraft: z.boolean().optional(),
});

export type CreateLoanFormInput = z.infer<typeof createLoanSchema>;
