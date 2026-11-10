import { useEffect, useState } from "react";
import { paperTradingApi } from "../api/paperTradingApi.js";

/* =========================================================
   Daily and per-strategy series from the full trade history
   (GET /paper-trades/history). Open trades are left out: their
   P&L is not realised yet.
   ========================================================= */

const tradeDay = (trade) => String(trade.exitTime ?? trade.entryTime ?? "").slice(0, 10);

export function buildSeries(trades = []) {
  const closed = trades.filter(
    (t) => String(t.status ?? "").toUpperCase() !== "OPEN" && tradeDay(t).length === 10,
  );

  const byDay = new Map();
  const byStrategy = new Map();

  closed.forEach((t) => {
    const pnl = Number(t.profitLoss ?? t.pnl ?? 0);
    const day = tradeDay(t);
    const d = byDay.get(day) ?? { date: day, pnl: 0, trades: 0, wins: 0, losses: 0 };
    d.pnl += pnl;
    d.trades += 1;
    if (pnl > 0) d.wins += 1;
    if (pnl < 0) d.losses += 1;
    byDay.set(day, d);

    const name = String(t.strategy ?? "UNTAGGED").toUpperCase();
    const s = byStrategy.get(name) ?? { name, pnl: 0, trades: 0, wins: 0 };
    s.pnl += pnl;
    s.trades += 1;
    if (pnl > 0) s.wins += 1;
    byStrategy.set(name, s);
  });

  let cum = 0;
  const days = [...byDay.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => {
      cum += d.pnl;
      return { ...d, cum, winRate: d.trades ? (d.wins / d.trades) * 100 : 0 };
    });

  const strategies = [...byStrategy.values()].sort((a, b) => b.pnl - a.pnl);
  const flat = closed.map((t) => ({
    date: tradeDay(t),
    pnl: Number(t.profitLoss ?? t.pnl ?? 0),
    strategy: String(t.strategy ?? "UNTAGGED").toUpperCase(),
  }));
  return { days, strategies, trades: flat };
}

/** Re-fetches whenever refreshKey changes (the dashboard passes its last-update time). */
export function useTradeSeries(refreshKey) {
  const [state, setState] = useState({ days: [], strategies: [], trades: [], loading: true, error: "" });

  useEffect(() => {
    let alive = true;
    paperTradingApi
      .getHistory()
      .then((response) => {
        const trades = Array.isArray(response) ? response : response?.trades ?? response?.data ?? [];
        if (alive) setState({ ...buildSeries(trades), loading: false, error: "" });
      })
      .catch((err) => {
        if (alive) setState((prev) => ({ ...prev, loading: false, error: String(err?.message ?? err) }));
      });
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  return state;
}

/** Current time, re-rendered every intervalMs (for clocks and countdowns). */
export function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
