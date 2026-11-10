import { API_BASE_URL } from "../config.js";

export async function request(path) {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `Request failed with status ${response.status}`);
  }
  return response.json();
}

export const getPnlDashboard = async () =>
  request("/paper-trades/pnldashboard");

export const getPnlByDateRange = async (fromDate, toDate) => {
  if (!fromDate || !toDate) {
    throw new Error("Both fromDate and toDate are required");
  }
  const params = new URLSearchParams({ fromDate, toDate });
  return request(`/paper-trades/pnl?${params.toString()}`);
};

export const getDailyPnl = async () => request("/paper-trades/daily-pnl");

export const getOpenPositions = async () =>
  request("/paper-trades/open-positions");

export const getHistory = async () => request("/paper-trades/history");

export const getHistoryByDateRange = async (fromDate, toDate) => {
  if (!fromDate || !toDate) {
    throw new Error("Both fromDate and toDate are required");
  }
  const params = new URLSearchParams({ fromDate, toDate });
  return request(`/paper-trades/historycustomdates?${params.toString()}`);
};

/* =========================================================
   FORMATTERS
   ========================================================= */

export const formatCurrency = (value) => {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
};

export const formatNumber = (value) => {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
};

export const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value).substring(0, 10);
  }
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
};

export const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
};

/* =========================================================
   OPEN POSITION P&L
   =========================================================

   BUY  = (Current/LTP - Entry) * Quantity
   SELL = (Entry - Current/LTP) * Quantity

   This is unrealized P&L for OPEN positions.
   Completed trade P&L continues to come from backend history.
   ========================================================= */

export const calculateOpenPositionPnl = (
  entryPrice,
  currentPrice,
  quantity,
  side,
) => {
  const entry = Number(entryPrice ?? 0);
  const current = Number(currentPrice ?? 0);
  const qty = Number(quantity ?? 0);

  if (
    !Number.isFinite(entry) ||
    !Number.isFinite(current) ||
    !Number.isFinite(qty) ||
    entry === 0 ||
    current === 0 ||
    qty === 0
  ) {
    return 0;
  }

  const normalizedSide = String(side ?? "")
    .trim()
    .toUpperCase();

  if (normalizedSide === "SELL") {
    return (entry - current) * qty;
  }

  return (current - entry) * qty;
};

/* =========================================================
   NORMALIZE OPEN POSITION
   ========================================================= */

export const normalizePosition = (position = {}) => {
  // Backend field aliases
  const entryPrice = Number(
    position.entryPrice ??
      position.entry ??
      position.averagePrice ??
      position.avgPrice ??
      0,
  );

  const quantity = Number(
    position.quantity ??
      position.qty ??
      position.orderQuantity ??
      position.orderedQuantity ??
      0,
  );

  const side = String(
    position.signal ??
      position.side ??
      position.tradeType ??
      position.transactionType ??
      "BUY",
  )
    .trim()
    .toUpperCase();

  // Prefer live/current price. Do NOT use exitPrice for an open position
  // unless the backend has no live price at all.
  const currentPrice = Number(
    position.currentPrice ??
      position.ltp ??
      position.lastTradedPrice ??
      position.current ??
      position.marketPrice ??
      position.exitPrice ??
      entryPrice,
  );

  // IMPORTANT: the /paper-trades/open-positions endpoint already calculates
  // the live unrealized P&L using its latest market price. Use currentPnL
  // directly instead of recalculating it in the browser.
  const currentPnL = Number(
    position.currentPnL ?? position.currentPnl ?? position.unrealizedPnl ?? 0,
  );

  const profitLoss = Number.isFinite(currentPnL) ? currentPnL : 0;

  return {
    id:
      position.id ??
      position.tradeId ??
      position.signalId ??
      `${position.symbol ?? position.instrument ?? "POSITION"}-${position.entryTime ?? Date.now()}`,

    date: position.entryTime ? formatDate(position.entryTime) : "-",

    user: position.user ?? position.userName ?? "Ram Kumar",

    symbol:
      position.symbol ??
      position.instrument ??
      position.tradingSymbol ??
      position.brokerSymbol ??
      "-",

    side,
    qty: quantity,

    entry: entryPrice,
    current: currentPrice,

    entryPrice,
    currentPrice,

    // Keep the backend field available for every consumer.
    currentPnL: profitLoss,
    pnl: profitLoss,
    profitLoss,

    status: position.status ?? "OPEN",

    entryTime: position.entryTime ?? null,
    exitTime: position.exitTime ?? null,

    raw: position,
  };
};

/* =========================================================
   NORMALIZE COMPLETED HISTORY TRADE
   ========================================================= */

export const normalizeHistoryTrade = (trade = {}) => {
  const entryPrice = Number(trade.entryPrice ?? trade.entry ?? 0);

  const exitPrice =
    trade.exitPrice !== null && trade.exitPrice !== undefined
      ? Number(trade.exitPrice)
      : entryPrice;

  const profitLoss = Number(trade.profitLoss ?? trade.pnl ?? trade.profit ?? 0);

  return {
    id:
      trade.id ??
      trade.tradeId ??
      trade.signalId ??
      `${trade.symbol}-${trade.exitTime ?? trade.entryTime}`,

    date: formatDate(trade.exitTime ?? trade.entryTime),

    time: formatDateTime(trade.exitTime ?? trade.entryTime),

    user: trade.user ?? trade.userName ?? "Ram Kumar",

    symbol: trade.symbol ?? trade.instrument ?? trade.tradingSymbol ?? "-",

    side: trade.signal ?? trade.side ?? trade.tradeType ?? "-",

    qty: Number(trade.quantity ?? trade.qty ?? 0),

    entry: entryPrice,
    current: exitPrice,
    entryPrice,
    exitPrice,

    pnl: profitLoss,
    profitLoss,

    status: trade.status ?? "CLOSED",

    entryTime: trade.entryTime ?? null,
    exitTime: trade.exitTime ?? null,

    raw: trade,
  };
};

/* =========================================================
   COMPATIBILITY API OBJECT
   ========================================================= */

export const paperTradingApi = {
  getPnlDashboard,
  getPnlByDateRange,
  getDailyPnl,
  getOpenPositions,
  getHistory,
  getHistoryByDateRange,
};
