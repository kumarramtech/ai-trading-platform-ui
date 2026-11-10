import { request } from "./paperTradingApi.js";

/* =========================================================
   FADE paper book — signal-engine /analytics/fade-book/summary
   =========================================================

   JSON: the day's shorts (default today) and the book's record.
   The record only counts finished days, so a live day's P&L is
   in dayPnl but not yet in record.total.
   ========================================================= */

export const getFadeBook = async (date) =>
  request(`/analytics/fade-book/summary${date ? `?date=${date}` : ""}`);

/** "5x40000 stop none day 10000 tp 500 nifty-up" (FadePaperBookService Settings.label). */
export function parseBookLabel(label = "") {
  const m = String(label).match(/^(\S+)x(\d+(?:\.\d+)?) stop (\S+) day (\S+)(?: tp (\S+))?( nifty-up)?/);
  if (!m) return null;
  const amount = (v) => (v === "none" ? null : Number(v));
  return {
    positions: m[1] === "all" ? null : Number(m[1]),
    notional: Number(m[2]),
    stop: m[3] === "none" ? null : m[3],
    dayCap: amount(m[4]),
    takeProfit: m[5] ? Number(m[5]) : null,
    niftyUpOnly: Boolean(m[6]),
  };
}

/** "ranks 501-600 up >= 2%" plus any filters after it (FadePaperBookService Pool.label). */
export function parsePoolLabel(label = "") {
  const m = String(label).match(/^ranks (\d+)-(\d+) up >= ([\d.]+)%(.*)$/);
  if (!m) return null;
  return { from: Number(m[1]), to: Number(m[2]), minMove: Number(m[3]), extra: m[4].trim() };
}

/* ---------------------------------------------------------
   FADE news study — /analytics/fade-news-study/summary (JSON)
   Study only: FADE still shorts every candidate. Each short is
   tagged at 09:46 from the company's headlines, and the split shows
   what a NO_NEWS-only book would have made (FadeNewsStudyService).
   --------------------------------------------------------- */
export const getFadeNewsStudy = async (date) =>
  request(`/analytics/fade-news-study/summary${date ? `?date=${date}` : ""}`);

// Fixed before any data (FadeNewsTagger / FadeNewsStudyService).
export const NEWS_STUDY_RULES = {
  minSessions: 60,
  minBps: 15,
  minT: 2,
};

/** "COLLECTING 3/60 sessions - no conclusion yet" | "PASSED" | "FAILED". */
export function parseVerdict(verdict = "") {
  const text = String(verdict ?? "");
  const collecting = text.match(/^COLLECTING (\d+)\/(\d+)/);
  if (collecting) {
    return { state: "collecting", sessions: Number(collecting[1]), target: Number(collecting[2]), text };
  }
  if (/^PASSED/.test(text)) return { state: "passed", text };
  if (/^FAILED/.test(text)) return { state: "failed", text };
  return { state: "unknown", text };
}

/** Kept headlines are joined with " | " by the tagger. */
export const splitHeadlines = (headlines) =>
  String(headlines ?? "")
    .split(" | ")
    .map((h) => h.trim())
    .filter(Boolean);
