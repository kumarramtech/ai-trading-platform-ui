const OPEN = 9 * 60 + 15;
const PRE_OPEN = 9 * 60;
const CLOSE = 15 * 60 + 30;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function istParts(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return { day: DAYS.indexOf(parts.weekday), minutes: Number(parts.hour) * 60 + Number(parts.minute), clock: `${parts.hour}:${parts.minute}` };
}

const span = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
};

/**
 * NSE cash-market session by the IST clock alone (weekdays 09:15–15:30).
 * It does not know exchange holidays: useMarketStatus() adds them from the API.
 */
export function marketSession(date = new Date()) {
  const { day, minutes, clock } = istParts(date);
  const weekday = day >= 1 && day <= 5;

  if (weekday && minutes >= OPEN && minutes < CLOSE) {
    return { state: "open", label: "MARKET OPEN", detail: `closes in ${span(CLOSE - minutes)}`, clock };
  }
  if (weekday && minutes >= PRE_OPEN && minutes < OPEN) {
    return { state: "pre", label: "PRE-OPEN", detail: `opens in ${span(OPEN - minutes)}`, clock };
  }

  let ahead = weekday && minutes < PRE_OPEN ? 0 : 1;
  while (((day + ahead) % 7 === 0) || ((day + ahead) % 7 === 6)) ahead += 1;
  const when = ahead === 0 ? "today" : ahead === 1 ? "tomorrow" : DAYS[(day + ahead) % 7];
  return { state: "closed", label: "MARKET CLOSED", detail: `opens ${when} 09:15`, clock };
}
