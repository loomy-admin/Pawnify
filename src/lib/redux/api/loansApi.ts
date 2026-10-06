import { api } from "./baseApi";
import { getLoanDetailAction } from "@/app/(app)/loans/[id]/actions";
import { getLoansListAction } from "@/app/(app)/loans/actions";
import {
  recordPaymentAction,
  closeLoanAction,
  releaseItemsAction,
  updateLoanNotesAction,
  deleteLoanAction,
  approveLoanAction,
  disburseLoanAction,
  cancelDraftLoanAction,
} from "@/app/(app)/loans/[id]/actions";
import { createLoanAction } from "@/app/(app)/loans/new/actions";
import type { LoanFilters } from "@/lib/services/loans";
import type { PaymentFormInput } from "@/lib/validation/payment";

export type LoanDetail = Awaited<ReturnType<typeof getLoanDetailAction>>;
export type LoansListResult = Awaited<ReturnType<typeof getLoansListAction>>;

export const loansApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getLoanById: builder.query<LoanDetail, string>({
      query: (id) => ({ action: getLoanDetailAction, args: [id] }),
      providesTags: (_result, _error, id) => [{ type: "Loan", id }],
    }),

    getLoans: builder.query<LoansListResult, LoanFilters>({
      query: (filters) => ({ action: getLoansListAction, args: [filters] }),
      providesTags: (result) =>
        result
          ? [
              ...result.loans.map((l) => ({ type: "Loan" as const, id: l.id })),
              { type: "LoanList" as const, id: "LIST" },
            ]
          : [{ type: "LoanList" as const, id: "LIST" }],
    }),

    createLoan: builder.mutation<
      { success: boolean; error?: string; loanId?: string },
      Parameters<typeof createLoanAction>[0]
    >({
      query: (formData) => ({ action: createLoanAction, args: [formData] }),
      invalidatesTags: [{ type: "LoanList", id: "LIST" }, "Dashboard"],
    }),

    recordPayment: builder.mutation<
      { success: boolean; error?: string; receiptNumber?: string },
      PaymentFormInput
    >({
      query: (formData) => ({ action: recordPaymentAction, args: [formData] }),
      invalidatesTags: (_result, _error, arg) => [
        { type: "Loan", id: arg.loanId },
        { type: "LoanList", id: "LIST" },
        "Dashboard",
      ],
    }),

    closeLoan: builder.mutation<{ success: boolean; error?: string }, string>({
      query: (loanId) => ({ action: closeLoanAction, args: [loanId] }),
      invalidatesTags: (_result, _error, loanId) => [
        { type: "Loan", id: loanId },
        { type: "LoanList", id: "LIST" },
        "Dashboard",
      ],
    }),

    releaseItems: builder.mutation<{ success: boolean; error?: string }, string>({
      query: (loanId) => ({ action: releaseItemsAction, args: [loanId] }),
      invalidatesTags: (_result, _error, loanId) => [{ type: "Loan", id: loanId }],
    }),

    updateLoanNotes: builder.mutation<
      { success: boolean; error?: string },
      { loanId: string; notes: string }
    >({
      query: ({ loanId, notes }) => ({ action: updateLoanNotesAction, args: [loanId, notes] }),
      invalidatesTags: (_result, _error, { loanId }) => [{ type: "Loan", id: loanId }],
    }),

    deleteLoan: builder.mutation<{ success: boolean; error?: string }, string>({
      query: (loanId) => ({ action: deleteLoanAction, args: [loanId] }),
      invalidatesTags: (_result, _error, loanId) => [
        { type: "Loan", id: loanId },
        { type: "LoanList", id: "LIST" },
        "Dashboard",
      ],
    }),

    approveLoan: builder.mutation<
      { success: boolean; error?: string },
      { loanId: string; notes?: string }
    >({
      query: ({ loanId, notes }) => ({ action: approveLoanAction, args: [loanId, notes] }),
      invalidatesTags: (_result, _error, { loanId }) => [
        { type: "Loan", id: loanId },
        { type: "LoanList", id: "LIST" },
        "Dashboard",
      ],
    }),

    disburseLoan: builder.mutation<{ success: boolean; error?: string }, string>({
      query: (loanId) => ({ action: disburseLoanAction, args: [loanId] }),
      invalidatesTags: (_result, _error, loanId) => [
        { type: "Loan", id: loanId },
        { type: "LoanList", id: "LIST" },
        "Dashboard",
      ],
    }),

    cancelDraftLoan: builder.mutation<
      { success: boolean; error?: string },
      { loanId: string; reason?: string }
    >({
      query: ({ loanId, reason }) => ({ action: cancelDraftLoanAction, args: [loanId, reason] }),
      invalidatesTags: (_result, _error, { loanId }) => [
        { type: "Loan", id: loanId },
        { type: "LoanList", id: "LIST" },
        "Dashboard",
      ],
    }),
  }),
});

export const {
  useGetLoanByIdQuery,
  useGetLoansQuery,
  useCreateLoanMutation,
  useRecordPaymentMutation,
  useCloseLoanMutation,
  useReleaseItemsMutation,
  useUpdateLoanNotesMutation,
  useDeleteLoanMutation,
  useApproveLoanMutation,
  useDisburseLoanMutation,
  useCancelDraftLoanMutation,
} = loansApi;
