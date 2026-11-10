import { request } from "./paperTradingApi.js";

/* =========================================================
   ALL PAPER BOOKS — signal-engine /analytics/account-overview
   =========================================================

   JSON: one entry per book (INTRADAY, FADE, MONTHLY MOMENTUM) with
   today's and total net P&L (after charges), charges, exposure,
   open positions and drawdown, plus totals across the books.
   ========================================================= */

export const getAccountOverview = async () => request("/analytics/account-overview");
