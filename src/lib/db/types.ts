import Decimal from "decimal.js";

export { Decimal };

export const Role = {
  ADMIN: "ADMIN",
  STAFF: "STAFF",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const MetalType = {
  GOLD: "GOLD",
  SILVER: "SILVER",
} as const;
export type MetalType = (typeof MetalType)[keyof typeof MetalType];

export const LoanStatus = {
  DRAFT: "DRAFT",
  APPROVED: "APPROVED",
  ACTIVE: "ACTIVE",
  CLOSED: "CLOSED",
  CANCELLED: "CANCELLED",
} as const;
export type LoanStatus = (typeof LoanStatus)[keyof typeof LoanStatus];

export const LoanType = {
  STANDARD: "STANDARD",
  CUMULATIVE: "CUMULATIVE",
} as const;
export type LoanType = (typeof LoanType)[keyof typeof LoanType];

export const CumulativeFrequency = {
  MONTHLY: "MONTHLY",
  QUARTERLY: "QUARTERLY",
  HALF_YEARLY: "HALF_YEARLY",
  YEARLY: "YEARLY",
} as const;
export type CumulativeFrequency = (typeof CumulativeFrequency)[keyof typeof CumulativeFrequency];

export const CumulativeTreatment = {
  ADD_TO_CAPITAL: "ADD_TO_CAPITAL",
  KEEP_SEPARATE: "KEEP_SEPARATE",
} as const;
export type CumulativeTreatment = (typeof CumulativeTreatment)[keyof typeof CumulativeTreatment];

export const KycDocType = {
  AADHAAR: "AADHAAR",
  PAN: "PAN",
  VOTER_ID: "VOTER_ID",
  PASSPORT: "PASSPORT",
  DRIVING_LICENSE: "DRIVING_LICENSE",
} as const;
export type KycDocType = (typeof KycDocType)[keyof typeof KycDocType];

export const KycStatus = {
  PENDING: "PENDING",
  VERIFIED: "VERIFIED",
  REJECTED: "REJECTED",
} as const;
export type KycStatus = (typeof KycStatus)[keyof typeof KycStatus];

export const PaymentMode = {
  CASH: "CASH",
  UPI: "UPI",
  BANK_TRANSFER: "BANK_TRANSFER",
  CARD: "CARD",
} as const;
export type PaymentMode = (typeof PaymentMode)[keyof typeof PaymentMode];

export const ChargeType = {
  PROCESSING_FEE: "PROCESSING_FEE",
  PENAL_CHARGE: "PENAL_CHARGE",
  OTHER: "OTHER",
} as const;
export type ChargeType = (typeof ChargeType)[keyof typeof ChargeType];

export const TransactionType = {
  DISBURSEMENT: "DISBURSEMENT",
  PAYMENT: "PAYMENT",
  CLOSURE: "CLOSURE",
  ITEM_RELEASE: "ITEM_RELEASE",
  CAPITAL_INTRO: "CAPITAL_INTRO",
  REVERSAL: "REVERSAL",
} as const;
export type TransactionType = (typeof TransactionType)[keyof typeof TransactionType];

export const FollowUpStatus = {
  PENDING: "PENDING",
  DONE: "DONE",
  CANCELLED: "CANCELLED",
} as const;
export type FollowUpStatus = (typeof FollowUpStatus)[keyof typeof FollowUpStatus];

export const AccountType = {
  ASSET: "ASSET",
  LIABILITY: "LIABILITY",
  INCOME: "INCOME",
  EXPENSE: "EXPENSE",
  EQUITY: "EQUITY",
} as const;
export type AccountType = (typeof AccountType)[keyof typeof AccountType];
