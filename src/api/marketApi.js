import { request } from "./paperTradingApi.js";

/* =========================================================
   MARKET STATUS — signal-engine /analytics/market-status
   =========================================================

   The NSE calendar (from stock-service) plus the clock, and whether
   our data feed is live (a NIFTY minute candle in the last 3 min).

   status: OPEN | PRE_OPEN (09:00-09:15) | BEFORE_OPEN | AFTER_CLOSE
           | HOLIDAY | WEEKEND
   Also: live, feedLive, tradingDay, reason, nextOpen, lastCandle,
   upcomingHolidays [{date, name}] (next three, today included).

   stock-service has /market/trading-day and /market/holidays too,
   but it sends no CORS headers, so the browser reads this one.
   ========================================================= */

export const getMarketStatus = async () => request("/analytics/market-status");
