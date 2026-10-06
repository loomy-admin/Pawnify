/**
 * Payment Validation Schema
 * Supports split payment (Cash + Bank simultaneously) & payment types
 */

import { z } from "zod";

export const paymentSchema = z.object({
  loanId: z.string().min(1, "Loan ID is required"),
  amountPaid: z.coerce.number().gt(0, "Payment amount must be greater than 0"),
  cashAmount: z.coerce.number().gte(0).optional().default(0),
  bankAmount: z.coerce.number().gte(0).optional().default(0),
  mode: z.enum(["CASH", "UPI", "BANK_TRANSFER", "CARD", "SPLIT"]).default("CASH"),
  paymentType: z
    .enum(["STANDARD", "INTEREST_ONLY", "PRINCIPAL_ONLY", "CHARGES_ONLY", "ADVANCE"])
    .optional()
    .default("STANDARD"),
  notes: z.string().max(500).optional().or(z.literal("")),
});

export type PaymentFormInput = z.infer<typeof paymentSchema>;
