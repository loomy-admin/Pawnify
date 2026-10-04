import { api } from "./baseApi";
import {
  getCustomerDetailAction,
  addKycDocumentAction,
  verifyKycDocumentAction,
  updateCustomerDetailsAction,
  deleteCustomerAction,
} from "@/app/(app)/customers/[id]/actions";
import { getCustomersListAction } from "@/app/(app)/customers/actions";
import { createCustomerAction } from "@/app/(app)/customers/new/actions";
import type { CustomerFilters } from "@/lib/services/customers";
import { KycStatus } from "@/lib/db/types";

export type CustomerDetail = Awaited<ReturnType<typeof getCustomerDetailAction>>;
export type CustomersListResult = Awaited<ReturnType<typeof getCustomersListAction>>;

export const customersApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getCustomerById: builder.query<CustomerDetail, string>({
      query: (id) => ({ action: getCustomerDetailAction, args: [id] }),
      providesTags: (_result, _error, id) => [{ type: "Customer", id }],
    }),

    getCustomers: builder.query<CustomersListResult, CustomerFilters>({
      query: (filters) => ({ action: getCustomersListAction, args: [filters] }),
      providesTags: (result) =>
        result
          ? [
              ...result.customers.map((c) => ({ type: "Customer" as const, id: c.id })),
              { type: "CustomerList" as const, id: "LIST" },
            ]
          : [{ type: "CustomerList" as const, id: "LIST" }],
    }),

    createCustomer: builder.mutation<
      { success: boolean; error?: string; customerId?: string },
      Parameters<typeof createCustomerAction>[0]
    >({
      query: (formData) => ({ action: createCustomerAction, args: [formData] }),
      invalidatesTags: [{ type: "CustomerList", id: "LIST" }],
    }),

    updateCustomerDetails: builder.mutation<
      { success: boolean; error?: string },
      { customerId: string; data: Parameters<typeof updateCustomerDetailsAction>[1] }
    >({
      query: ({ customerId, data }) => ({
        action: updateCustomerDetailsAction,
        args: [customerId, data],
      }),
      invalidatesTags: (_result, _error, { customerId }) => [
        { type: "Customer", id: customerId },
        { type: "CustomerList", id: "LIST" },
      ],
    }),

    deleteCustomer: builder.mutation<{ success: boolean; error?: string }, string>({
      query: (customerId) => ({ action: deleteCustomerAction, args: [customerId] }),
      invalidatesTags: (_result, _error, customerId) => [
        { type: "Customer", id: customerId },
        { type: "CustomerList", id: "LIST" },
      ],
    }),

    addKycDocument: builder.mutation<
      { success: boolean; error?: string; docId?: string },
      { customerId: string; formData: Parameters<typeof addKycDocumentAction>[1] }
    >({
      query: ({ customerId, formData }) => ({
        action: addKycDocumentAction,
        args: [customerId, formData],
      }),
      invalidatesTags: (_result, _error, { customerId }) => [
        { type: "Customer", id: customerId },
        { type: "CustomerList", id: "LIST" },
      ],
    }),

    verifyKycDocument: builder.mutation<
      { success: boolean; error?: string },
      { docId: string; customerId: string; status: KycStatus }
    >({
      query: ({ docId, customerId, status }) => ({
        action: verifyKycDocumentAction,
        args: [docId, customerId, status],
      }),
      invalidatesTags: (_result, _error, { customerId }) => [
        { type: "Customer", id: customerId },
        { type: "CustomerList", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useGetCustomerByIdQuery,
  useGetCustomersQuery,
  useCreateCustomerMutation,
  useUpdateCustomerDetailsMutation,
  useDeleteCustomerMutation,
  useAddKycDocumentMutation,
  useVerifyKycDocumentMutation,
} = customersApi;
