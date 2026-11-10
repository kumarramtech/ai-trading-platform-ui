import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getMarketStatus } from "../api/marketApi.js";
import { marketSession } from "../utils/marketSession.js";
import { useNow } from "./useTradeSeries.js";

/* =========================================================
   One market status for the whole app.

   The backend decides whether today is a trading day (NSE
   holidays, weekends) and whether our data feed is live. Within a
   trading day the session (pre-open / open / closed) follows the
   local IST clock, so it switches exactly at 09:00, 09:15 and 15:30
   instead of up to a minute late. If the API cannot be reached, the
   clock alone is used and holidays are unknown (source "clock").
   ========================================================= */

const POLL_MS = 60000;
const MarketStatusContext = createContext(null);

const istDate = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(date);

export function MarketStatusProvider({ children }) {
  const now = useNow(15000);
  const [api, setApi] = useState(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setApi(await getMarketStatus());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const value = useMemo(() => {
    const today = istDate(now);
    const clock = marketSession(now);
    // The API answer is only about the day it was made on.
    const fresh = api && String(api.now ?? "").slice(0, 10) === today;

    if (!fresh) {
      return {
        state: clock.state,
        live: clock.state === "open",
        tradingDay: null,
        holidayName: null,
        feedLive: null,
        nextOpen: null,
        upcomingHolidays: api?.upcomingHolidays ?? [],
        message: null,
        clock: clock.clock,
        today,
        source: "clock",
        failed,
        refresh: load,
      };
    }

    let state;
    if (!api.tradingDay) {
      state = api.status === "WEEKEND" ? "weekend" : "holiday";
    } else {
      state = clock.state; // open | pre | closed, exact to the minute
    }
    const holiday = (api.upcomingHolidays ?? []).find((h) => h.date === today);

    return {
      state,
      live: state === "open",
      tradingDay: api.tradingDay,
      holidayName: state === "holiday" ? holiday?.name ?? String(api.reason ?? "").replace("NSE holiday: ", "") : null,
      // Only meaningful in the session; the backend reports false outside it.
      feedLive: state === "open" ? api.feedLive : null,
      lastCandle: api.lastCandle,
      nextOpen: state === "open" ? null : api.nextOpen,
      upcomingHolidays: api.upcomingHolidays ?? [],
      message: api.message,
      clock: clock.clock,
      today,
      source: "api",
      failed,
      refresh: load,
    };
  }, [api, failed, now, load]);

  return <MarketStatusContext.Provider value={value}>{children}</MarketStatusContext.Provider>;
}

/** { state: open|pre|closed|holiday|weekend, live, tradingDay, holidayName, feedLive, nextOpen, upcomingHolidays, ... } */
export function useMarketStatus() {
  const value = useContext(MarketStatusContext);
  if (!value) throw new Error("useMarketStatus needs <MarketStatusProvider>");
  return value;
}

/** "today" | "tomorrow" | "Mon 16 Nov" for an ISO date-time, relative to today in IST. */
export function relativeDay(iso, today) {
  if (!iso) return null;
  const day = String(iso).slice(0, 10);
  if (day === today) return "today";
  const next = new Date(`${today}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  if (day === next.toISOString().slice(0, 10)) return "tomorrow";
  return new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "short" }).format(
    new Date(`${day}T00:00:00Z`),
  );
}
