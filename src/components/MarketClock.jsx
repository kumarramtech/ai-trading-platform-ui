import React from "react";
import { Box, Tooltip } from "@mui/material";
import { marketSession } from "../utils/marketSession.js";
import { useMarketStatus, relativeDay } from "../hooks/useMarketStatus.jsx";

// Kept here too so existing imports keep working.
export { marketSession };

const holidayDate = (iso) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "short" }).format(
    new Date(`${iso}T00:00:00Z`),
  );

const timeOf = (iso) => (iso ? String(iso).slice(11, 16) : "09:15");

/** What the pill says for each state. */
function describe(m) {
  const session = marketSession(new Date());
  const next = m.nextOpen ? `opens ${relativeDay(m.nextOpen, m.today)} ${timeOf(m.nextOpen)}` : session.detail;

  switch (m.state) {
    case "open":
      // The first NIFTY candle lands a minute or two after 09:15: no warning before 09:18.
      return m.feedLive === false && session.clock >= "09:18"
        ? { tone: "warn", label: "MARKET OPEN", detail: "our data feed is delayed" }
        : { tone: "open", label: "MARKET OPEN", detail: session.detail };
    case "pre":
      return { tone: "pre", label: "PRE-OPEN", detail: session.detail };
    case "holiday":
      return { tone: "holiday", label: "MARKET HOLIDAY", detail: `${m.holidayName ?? "NSE holiday"} · ${next}` };
    case "weekend":
      return { tone: "closed", label: "WEEKEND", detail: next };
    default:
      return { tone: "closed", label: "MARKET CLOSED", detail: next };
  }
}

function Details({ m }) {
  const upcoming = m.upcomingHolidays.filter((h) => h.date > m.today);
  return (
    <Box className="marketTip">
      {m.source === "api" ? (
        <>
          <b>{m.message}</b>
          {m.nextOpen && (
            <span>
              Next session: {relativeDay(m.nextOpen, m.today)} at {timeOf(m.nextOpen)} IST
            </span>
          )}
          {m.state === "open" && (
            <span>
              Data feed: {m.feedLive ? "live" : "no NIFTY candle in the last 3 minutes"}
              {m.lastCandle ? ` (last ${timeOf(m.lastCandle)})` : ""}
            </span>
          )}
        </>
      ) : (
        <b>Market calendar unavailable: weekdays 09:15–15:30 IST by the clock; holidays not known.</b>
      )}
      {upcoming.length > 0 && (
        <>
          <em>Upcoming NSE holidays</em>
          <ul>
            {upcoming.map((h) => (
              <li key={h.date}>
                <span>{holidayDate(h.date)}</span> {h.name}
              </li>
            ))}
          </ul>
        </>
      )}
    </Box>
  );
}

/** NSE session pill: calendar from the signal engine, clock from this browser (IST). */
export default function MarketClock() {
  const m = useMarketStatus();
  const { tone, label, detail } = describe(m);

  return (
    <Tooltip title={<Details m={m} />} arrow>
      <Box className={`marketClock ${tone}`} role="status" aria-label={`${label}, ${detail}`}>
        <span className="marketDot" />
        <span className="marketText">
          <b>{label}</b>
          <small>{detail}</small>
        </span>
        <span className="marketTime">{m.clock} IST</span>
      </Box>
    </Tooltip>
  );
}
