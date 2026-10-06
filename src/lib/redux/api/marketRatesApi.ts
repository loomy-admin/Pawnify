import { api } from "./baseApi";
import { getMarketRatesAction, updateMarketRatesAction } from "@/lib/actions/market-rates-actions";

export type MarketRatesData = Awaited<ReturnType<typeof getMarketRatesAction>>;

export const marketRatesApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getMarketRates: builder.query<MarketRatesData, void>({
      query: () => ({ action: getMarketRatesAction, args: [] }),
      providesTags: ["MarketRate"],
    }),
    updateMarketRates: builder.mutation<MarketRatesData, { goldRate: number; silverRate: number }>({
      query: (rates) => ({ action: updateMarketRatesAction, args: [rates] }),
      invalidatesTags: ["MarketRate", "Dashboard"],
    }),
  }),
});

export const { useGetMarketRatesQuery, useUpdateMarketRatesMutation } = marketRatesApi;

