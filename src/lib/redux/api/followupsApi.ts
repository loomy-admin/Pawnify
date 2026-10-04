import { api } from "./baseApi";
import {
  getFollowUpsAction,
  createFollowUpAction,
  updateFollowUpStatusAction,
  deleteFollowUpAction,
} from "@/app/(app)/followups/actions";
import type { FollowUpStatus } from "@/lib/db/types";

export type FollowUpsData = Awaited<ReturnType<typeof getFollowUpsAction>>;

export const followupsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getFollowUps: builder.query<FollowUpsData, string>({
      query: (tab) => ({ action: getFollowUpsAction, args: [tab] }),
      providesTags: (result) =>
        result
          ? [
              ...result.followUps.map((f) => ({ type: "FollowUp" as const, id: f.id })),
              { type: "FollowUp" as const, id: "LIST" },
            ]
          : [{ type: "FollowUp" as const, id: "LIST" }],
    }),

    createFollowUp: builder.mutation<
      { success: boolean; error?: string },
      { loanId: string; note: string; dueDateStr: string }
    >({
      query: ({ loanId, note, dueDateStr }) => ({
        action: createFollowUpAction,
        args: [loanId, note, dueDateStr],
      }),
      invalidatesTags: [{ type: "FollowUp", id: "LIST" }],
    }),

    updateFollowUpStatus: builder.mutation<
      { success: boolean; error?: string },
      { id: string; status: FollowUpStatus }
    >({
      query: ({ id, status }) => ({ action: updateFollowUpStatusAction, args: [id, status] }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "FollowUp", id },
        { type: "FollowUp", id: "LIST" },
      ],
    }),

    deleteFollowUp: builder.mutation<{ success: boolean; error?: string }, string>({
      query: (id) => ({ action: deleteFollowUpAction, args: [id] }),
      invalidatesTags: (_result, _error, id) => [
        { type: "FollowUp", id },
        { type: "FollowUp", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useGetFollowUpsQuery,
  useCreateFollowUpMutation,
  useUpdateFollowUpStatusMutation,
  useDeleteFollowUpMutation,
} = followupsApi;
