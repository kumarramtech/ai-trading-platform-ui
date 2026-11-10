import { API_BASE_URL } from "../config.js";

/* =========================================================
   MONTHLY MOMENTUM — signal-engine /analytics endpoints
   =========================================================

   Both endpoints answer text/plain (the same text that goes to Slack),
   so the dashboard parses it here. The raw text is always kept so a
   format change never hides information from the user.

   GET /analytics/momentum-paper    paper portfolio vs NIFTY (fast)
   GET /analytics/momentum-signal   this month's list from the latest
                                    closes, not stored or sent (~2 min)
   ========================================================= */

async function requestText(path, { signal, timeoutMs = 30000, method = "GET" } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, { method, signal: controller.signal });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(text || `Request failed with status ${response.status}`);
    }
    return text;
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error(signal?.aborted ? "Cancelled" : `Timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

const num = (value) => {
  const n = Number(String(value ?? "").replace(/[+,]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const list = (value) =>
  String(value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && s.toLowerCase() !== "none");

/* ---------------------------------------------------------
   Paper portfolio report (MomentumPaperService.report)
   --------------------------------------------------------- */
export function parseMomentumPaper(text = "") {
  const result = {
    raw: text,
    started: false,
    startedOn: null,
    equity: null,
    equityDay: null,
    returnPct: null,
    pnl: null,
    maxDrawdownPct: null,
    niftyPct: null,
    cash: null,
    realised: null,
    charges: null,
    holdings: [],
  };

  if (/not started/i.test(text)) return result;

  const since = text.match(/PAPER MOMENTUM since (\S+)/);
  if (!since) return result;
  result.started = true;
  result.startedOn = since[1];

  const equity = text.match(
    /equity Rs (-?[\d.]+) on (\S+): ([+-]?[\d.]+)% \(Rs ([+-]?[\d.]+)\), max drawdown ([\d.]+)%/,
  );
  if (equity) {
    result.equity = num(equity[1]);
    result.equityDay = equity[2];
    result.returnPct = num(equity[3]);
    result.pnl = num(equity[4]);
    result.maxDrawdownPct = num(equity[5]);
  }

  const nifty = text.match(/NIFTY over the same days: ([+-]?[\d.]+)%/);
  if (nifty) result.niftyPct = num(nifty[1]);

  const cash = text.match(/cash Rs (-?[\d.]+), realised P&L Rs ([+-]?[\d.]+), charges paid Rs ([\d.]+)/);
  if (cash) {
    result.cash = num(cash[1]);
    result.realised = num(cash[2]);
    result.charges = num(cash[3]);
  }

  const holding = text.match(/holding \d+:([^\n]*)/);
  if (holding) result.holdings = list(holding[1]);

  return result;
}

/* ---------------------------------------------------------
   Monthly signal (MomentumSignalService.toText)
   --------------------------------------------------------- */
export function parseMomentumSignal(text = "") {
  const result = {
    raw: text,
    month: null,
    signalDay: null,
    niftyClose: null,
    smaDays: null,
    niftyAverage: null,
    riskOn: null,
    capital: null,
    stocks: null,
    slot: null,
    sells: [],
    keeps: [],
    buys: [],
    buysTotal: null,
    tooDear: [],
    fullList: [],
    rule: null,
  };

  const head = text.match(/MONTHLY MOMENTUM (\S+)\s+\(ranked on the (\S+) close/);
  if (head) {
    result.month = head[1];
    result.signalDay = head[2];
  }

  const regime = text.match(/NIFTY (-?[\d.]+) vs (\d+)-day average (-?[\d.]+): (ABOVE|BELOW)/);
  if (regime) {
    result.niftyClose = num(regime[1]);
    result.smaDays = num(regime[2]);
    result.niftyAverage = num(regime[3]);
    result.riskOn = regime[4] === "ABOVE";
  }

  const capital = text.match(/Capital Rs ([\d.]+), (\d+) stocks, Rs ([\d.]+) each/);
  if (capital) {
    result.capital = num(capital[1]);
    result.stocks = num(capital[2]);
    result.slot = num(capital[3]);
  }

  const sellAll = text.match(/SELL ALL: ([^\n]*)/);
  const sell = text.match(/SELL \(dropped out[^)]*\): ([^\n]*)/);
  result.sells = list((sellAll ?? sell)?.[1]);

  const keep = text.match(/KEEP \(already held\): ([^\n]*)/);
  result.keeps = list(keep?.[1]);

  const buyLine = /^\s*(\d+)\.\s+(\S+)\s+qty\s+(\d+)\s+@ ~Rs\s+([\d.]+)\s+= Rs\s+([\d.]+)/gm;
  let m;
  while ((m = buyLine.exec(text)) !== null) {
    result.buys.push({
      rank: num(m[1]),
      symbol: m[2],
      quantity: num(m[3]),
      price: num(m[4]),
      amount: num(m[5]),
    });
  }

  const total = text.match(/buys total ~Rs ([\d.]+)/);
  if (total) result.buysTotal = num(total[1]);

  const dear = text.match(/NOT BOUGHT[^:]*: ([^\n]*)/);
  if (dear) {
    result.tooDear = [...dear[1].matchAll(/(\S+) \(Rs (\d+)\)/g)].map((d) => ({
      symbol: d[1],
      price: num(d[2]),
    }));
  }

  const full = text.match(/FULL LIST: ([^\n]*)/);
  result.fullList = list(full?.[1]);

  const rule = text.match(/Rule: ([^\n]*)/);
  if (rule) result.rule = rule[1].trim();

  return result;
}

/* ---------------------------------------------------------
   Long-term monitor (LongTermMonitorService.status): prices the
   paper holdings every interval on its own thread.
   --------------------------------------------------------- */
export function parseLongTermMonitor(text = "") {
  const result = {
    raw: text,
    intervalSeconds: null,
    warnPct: null,
    stop: null,
    weeklyEntry: null,
    lastCheck: null,
    holdings: [],
  };

  const head = text.match(/every (\d+) s .*?\| warn ([\d.]+)% \| stop (.+?) \| weekly entry (on|off)/);
  if (head) {
    result.intervalSeconds = num(head[1]);
    result.warnPct = num(head[2]);
    result.stop = head[3].trim();
    result.weeklyEntry = head[4] === "on";
  }

  const check = text.match(/last check: (\S+)/);
  if (check && check[1] !== "none") result.lastCheck = check[1];

  const row = /^\s+(\S+)\s+(\d+) @\s+([\d.]+)\s+last\s+(-|[\d.]+)(?:\s+([+-]?[\d.]+)%\s+(\S+))?/gm;
  let m;
  while ((m = row.exec(text)) !== null) {
    const entry = num(m[3]);
    const last = m[4] === "-" ? null : num(m[4]);
    const quantity = num(m[2]);
    result.holdings.push({
      symbol: m[1],
      quantity,
      entry,
      last,
      changePct: last != null && entry ? (last / entry - 1) * 100 : null,
      pnl: last != null ? (last - entry) * quantity : null,
      level: m[6] ?? null,
    });
  }
  return result;
}

/* ---------------------------------------------------------
   Holdings at the latest price (MomentumPaperService.portfolioView),
   JSON. Each price says where it came from: LIVE (market stream,
   in the session), LAST_MINUTE (last stored 1-minute close, so it
   also works after the close) or NONE (no price: valued at cost).
   --------------------------------------------------------- */
export async function getMomentumHoldings(options) {
  const view = JSON.parse(await requestText("/analytics/momentum-paper/holdings", options));
  return {
    ...view,
    positions: (view.positions ?? []).map((p) => ({
      symbol: p.symbol,
      quantity: p.quantity,
      entry: p.buyPrice,
      last: p.lastPrice,
      changePct: p.pnlPct,
      pnl: p.pnl,
      cost: p.cost,
      value: p.value,
      source: p.priceSource,
      priceTime: p.priceTime,
    })),
  };
}

export const getLongTermMonitor = async (options) =>
  parseLongTermMonitor(await requestText("/analytics/long-term-monitor", options));

export const getMomentumPaper = async (options) =>
  parseMomentumPaper(await requestText("/analytics/momentum-paper", options));

// The preview fetches ~200 daily histories on the server; it takes about 2 minutes.
export const getMomentumSignalPreview = async (options = {}) =>
  parseMomentumSignal(
    await requestText("/analytics/momentum-signal", { timeoutMs: 6 * 60 * 1000, ...options }),
  );

// Stores this month's list and sends it to Slack. 409 when already published
// (force=true replaces it). Computes the list first, so it also takes ~2 minutes.
export const publishMomentumSignal = async (force = false) =>
  parseMomentumSignal(
    await requestText(`/analytics/momentum-signal/publish${force ? "?force=true" : ""}`, {
      method: "POST",
      timeoutMs: 6 * 60 * 1000,
    }),
  );

// Trades this month's published list on paper at live prices, once per month.
// 409 when no list is published yet or the month is already traded.
export const rebalanceMomentumPaper = async () =>
  requestText("/analytics/momentum-paper/rebalance", { method: "POST", timeoutMs: 3 * 60 * 1000 });

/* ---------------------------------------------------------
   Schedule (MomentumSignalScheduler: weekdays 1-7 of the month)
   --------------------------------------------------------- */
const IST_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * First trading day of the month after `from` (or this month if not yet past): the
 * scheduler skips weekends and NSE holidays. `holidays`: known holiday dates
 * (YYYY-MM-DD, e.g. upcomingHolidays from /analytics/market-status).
 */
export function nextRebalanceDate(from = new Date(), holidays = []) {
  const [y, mo, d] = IST_DATE.format(from).split("-").map(Number);
  const closed = new Set(holidays.map((h) => (typeof h === "string" ? h : h.date)));
  const firstWeekday = (year, month) => {
    const date = new Date(Date.UTC(year, month, 1));
    while (date.getUTCDay() === 0 || date.getUTCDay() === 6 || closed.has(date.toISOString().slice(0, 10))) {
      date.setUTCDate(date.getUTCDate() + 1);
    }
    return date;
  };
  const thisMonth = firstWeekday(y, mo - 1);
  if (thisMonth.getUTCDate() >= d) return thisMonth;
  return firstWeekday(y, mo);
}
