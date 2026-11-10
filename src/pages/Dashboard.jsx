import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Typography, Grid, Card, Stack, Alert, IconButton, Tooltip, Avatar, Button } from "@mui/material";
import {
  RefreshRounded,
  TodayRounded,
  AccountBalanceWalletRounded,
  DonutLargeRounded,
  LayersRounded,
  BoltRounded,
  TrendingDownRounded,
  RocketLaunchRounded,
  ArrowForwardRounded,
  StarRounded,
  EventBusyRounded,
  EventRounded,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import StatCard, { Sparkline, ACCENTS } from "../components/StatCard.jsx";
import MarketClock from "../components/MarketClock.jsx";
import { useMarketStatus, relativeDay } from "../hooks/useMarketStatus.jsx";
import BooksOverview from "../components/BooksOverview.jsx";
import { useNow, useTradeSeries } from "../hooks/useTradeSeries.js";
import { getAccountOverview } from "../api/accountApi.js";
import { getMomentumPaper, nextRebalanceDate } from "../api/momentumApi.js";
import { getFadeBook, getFadeNewsStudy, parseVerdict } from "../api/fadeApi.js";

/* =========================================================
   DASHBOARD — every paper book at a glance.
   Each strategy has its own page (Intraday, FADE, Monthly
   Momentum); this page only summarises and links to them.
   ========================================================= */

const REFRESH_MS = 60000;
const SPARK_DAYS = 20;

const rupees = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const flat = (v) => v == null || Math.abs(v) < 0.5;
const inr = (v) => (v == null ? "—" : rupees.format(Math.abs(v) < 0.5 ? 0 : v));
const signed = (v) => (v == null ? "—" : flat(v) ? rupees.format(0) : `${v > 0 ? "+" : "−"}${rupees.format(Math.abs(v))}`);
const signedPct = (v) => (v == null ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}%`);
const tone = (v) => (flat(v) ? "" : v > 0 ? "profit" : "loss");
const statTone = (v) => (flat(v) ? "" : v > 0 ? "positive" : "negative");
const shortDate = (iso) =>
  iso
    ? new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", day: "2-digit", month: "short" }).format(new Date(`${iso}T00:00:00Z`))
    : "—";

function greeting(now) {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(now),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const clockIST = (date) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true })
    .format(date)
    .toUpperCase();

/** One strategy's card: headline figure, a few facts, a trend and a link to its page. */
/** Today | This month | Overall, one row, same scale in every card. */
function PnlStrip({ cells }) {
  return (
    <Box className="pnlStrip">
      {cells.map((c) => (
        <Tooltip key={c.label} title={c.hint ?? ""} disableHoverListener={!c.hint}>
          <Box className="pnlCell">
            <span>{c.label}</span>
            <strong className={c.value == null ? "" : tone(c.value)}>{c.value == null ? "—" : signed(c.value)}</strong>
            <small>{c.detail ?? " "}</small>
          </Box>
        </Tooltip>
      ))}
    </Box>
  );
}

function StrategyCard({ title, subtitle, icon, accent, badge, route, pnl, metrics, trend, trendLabel, note }) {
  const navigate = useNavigate();
  return (
    <Card className={`performanceCard strategyCard accent-${accent}`}>
      <Box className="performanceHeader">
        <Box>
          <Typography className="performanceTitle">
            {title}
            {badge}
          </Typography>
          <Typography className="performanceSubtitle">{subtitle}</Typography>
        </Box>
        <Box className={`strategyIcon accent-${accent}`}>{icon}</Box>
      </Box>

      <PnlStrip cells={pnl} />

      <Box className="performanceMetrics">
        {trend?.length > 1 && (
          <Box className="metricRow strategyTrend">
            <span>Trend</span>
            <Sparkline points={trend} color={ACCENTS[accent]} label={trendLabel} />
          </Box>
        )}
        {metrics.map(([label, value, cls]) => (
          <Box key={label} className="metricRow">
            <span>{label}</span>
            <b className={cls ?? ""}>{value}</b>
          </Box>
        ))}
      </Box>

      {note && <Typography className="strategyNote">{note}</Typography>}

      <Box className="progressBlock strategyGo">
        <Button fullWidth variant="outlined" endIcon={<ArrowForwardRounded />} onClick={() => navigate(route)}>
          Open {title}
        </Button>
      </Box>
    </Card>
  );
}

export default function Dashboard() {
  const now = useNow(30000);
  const [overview, setOverview] = useState(null);
  const [momentum, setMomentum] = useState(null);
  const [fade, setFade] = useState(null);
  const [study, setStudy] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    // Each source is independent: one failing never blanks the others.
    const [o, m, f, s] = await Promise.allSettled([
      getAccountOverview(),
      getMomentumPaper(),
      getFadeBook(),
      getFadeNewsStudy(),
    ]);
    if (o.status === "fulfilled") {
      setOverview(o.value);
      setError("");
    } else {
      setError(String(o.reason?.message ?? o.reason));
    }
    if (m.status === "fulfilled") setMomentum(m.value);
    if (f.status === "fulfilled") setFade(f.value);
    if (s.status === "fulfilled") setStudy(s.value);
    setUpdatedAt(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const market = useMarketStatus();
  const live = market.live;
  // No session today (NSE holiday or weekend): "today" figures are not pending, there are none.
  const closedDay = market.state === "holiday" || market.state === "weekend";
  const closedLabel = market.state === "holiday" ? "holiday" : "weekend";
  const nextOpenText = market.nextOpen
    ? `${relativeDay(market.nextOpen, market.today)} at ${String(market.nextOpen).slice(11, 16)}`
    : null;
  // A holiday in the next 7 days, to warn about ahead of time.
  const soonHoliday = (market.upcomingHolidays ?? []).find((h) => {
    if (h.date <= market.today) return false;
    const days = (new Date(`${h.date}T00:00:00Z`) - new Date(`${market.today}T00:00:00Z`)) / 86400000;
    return days <= 7;
  });
  useEffect(() => {
    if (!live) return undefined;
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [live, load]);

  // Intraday trend from the trade history, re-read at most once a minute.
  const series = useTradeSeries(updatedAt ? Math.floor(updatedAt.getTime() / 60000) : 0);

  const books = overview?.books ?? [];
  const byName = (name) => books.find((b) => b.book === name);
  const intraday = byName("INTRADAY");
  const fadeBook = byName("FADE");
  const mom = byName("MONTHLY MOMENTUM");

  const totals = useMemo(() => {
    const budget = books.reduce((sum, b) => sum + (b.budget ?? 0), 0);
    const exposure = (overview?.longExposure ?? 0) + (overview?.shortExposure ?? 0);
    return {
      budget,
      exposure,
      exposurePct: budget ? (exposure / budget) * 100 : null,
      todayTrades: books.reduce((sum, b) => sum + (b.todayTrades ?? 0), 0),
      open: books.reduce((sum, b) => sum + (b.openPositions ?? 0), 0),
      unrealised: books.reduce((sum, b) => sum + (b.unrealised ?? 0), 0),
      since: books.map((b) => b.since).filter(Boolean).sort()[0],
      sessions: Math.max(0, ...books.map((b) => b.sessions ?? 0)),
    };
  }, [books, overview]);

  const intradayTrend = series.days.slice(-SPARK_DAYS).map((d) => d.cum);
  const fadeTrend = useMemo(() => {
    let cum = 0;
    return (fade?.record?.days ?? []).map((d) => (cum += d.net));
  }, [fade]);

  // Calendar month in IST; "this month" = everything on or after its 1st.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
  const monthStart = `${today.slice(0, 7)}-01`;
  const monthName = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", month: "short" }).format(new Date(`${monthStart}T00:00:00Z`));
  const sum = (days, pick = (d) => d.pnl) => days.reduce((acc, d) => acc + pick(d), 0);

  // Intraday: all three from the closed-trade history, so they add up.
  const intradayPnl = useMemo(() => {
    if (!series.days.length) return null;
    return {
      today: sum(series.days.filter((d) => d.date === today)),
      month: sum(series.days.filter((d) => d.date >= monthStart)),
      overall: sum(series.days),
      first: series.days[0].date,
      todayTrades: series.days.find((d) => d.date === today)?.trades ?? 0,
    };
  }, [series.days, today, monthStart]);

  // FADE: the book total minus the finished sessions before this month.
  const fadeMonth = fadeBook
    ? fadeBook.totalNet - sum((fade?.record?.days ?? []).filter((d) => d.date < monthStart), (d) => d.net)
    : null;

  // Momentum: monthNet when the backend sends it; until then exact only if the book began this month.
  const momMonth = mom ? (mom.monthNet ?? (mom.since >= monthStart ? mom.totalNet : null)) : null;

  const verdict = study ? parseVerdict(study.verdict) : null;
  const nextRebalance = new Intl.DateTimeFormat("en-IN", {
    timeZone: "UTC",
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(nextRebalanceDate(now, market.upcomingHolidays));
  const winRate = (b) => (b?.trades ? `${Math.round((b.winners / b.trades) * 100)}% · ${b.winners}/${b.trades}` : "—");
  const invested = mom?.budget ? (mom.longExposure / mom.budget) * 100 : null;

  return (
    <Box>
      <Box className="dashboardHeader">
        <Box className="headerGreeting">
          <Typography className="eyebrow">RAM • RISK & AI MONITOR</Typography>
          <Typography className="pageTitle">{greeting(now)}, Ram</Typography>
          <Typography className="mmSubtitle">
            All three paper books at a glance. Open a strategy from the cards or the sidebar for its full view.
          </Typography>
        </Box>
        <Stack className="headerControls" direction="row" spacing={1.1} alignItems="center">
          <MarketClock />
          <Box className={`liveBadge ${error ? "offline" : ""}`}>
            <span className="pulse" /> {error ? "API UNREACHABLE" : "LIVE API CONNECTED"}
          </Box>
          <Tooltip title={updatedAt ? `Last updated ${clockIST(updatedAt)} IST` : "Refresh"}>
            <span>
              <IconButton onClick={load} disabled={loading} className="refreshBtn" aria-label="Refresh dashboard">
                <RefreshRounded className={loading ? "spin" : ""} />
              </IconButton>
            </span>
          </Tooltip>
          <Avatar className="userAvatar">RK</Avatar>
        </Stack>
      </Box>

      {market.state === "holiday" && (
        <Alert className="apiAlert marketAlert" severity="info" icon={<EventBusyRounded />}>
          <b>NSE holiday today: {market.holidayName}.</b> None of the books trade today.
          {nextOpenText ? ` The next session opens ${nextOpenText} IST.` : ""}
        </Alert>
      )}
      {market.state !== "holiday" && soonHoliday && (
        <Alert className="apiAlert marketAlert soon" severity="info" icon={<EventRounded />}>
          Heads-up: NSE is closed on{" "}
          <b>
            {relativeDay(soonHoliday.date, market.today)} ({soonHoliday.name})
          </b>
          . No book trades that day.
        </Alert>
      )}
      {error && (
        <Alert className="apiAlert" severity="warning" onClose={() => setError("")}>
          Account overview: {error}
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            accent="green"
            label="Today, All Books"
            // No session: nothing traded, so any "today" change is only re-pricing of holdings.
            value={overview && !closedDay ? signed(overview.todayNet) : "—"}
            detail={
              closedDay
                ? `Market ${closedLabel} · no session`
                : overview
                  ? `${totals.todayTrades} trades · net of charges`
                  : "Loading…"
            }
            icon={<TodayRounded />}
            tone={closedDay ? "" : statTone(overview?.todayNet)}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            accent="blue"
            label="Total, All Books"
            value={overview ? signed(overview.totalNet) : "—"}
            detail={overview ? `Since ${shortDate(totals.since)} · charges ${inr(overview.totalCharges)}` : "Loading…"}
            icon={<AccountBalanceWalletRounded />}
            tone={statTone(overview?.totalNet)}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            accent="purple"
            label="Capital at Work"
            value={overview ? inr(totals.exposure) : "—"}
            detail={
              totals.exposurePct != null
                ? `${totals.exposurePct.toFixed(0)}% of ${inr(totals.budget)} budget`
                : "Loading…"
            }
            icon={<DonutLargeRounded />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            accent="amber"
            label="Open Positions"
            value={overview ? totals.open : "—"}
            detail={overview ? (totals.open ? `${signed(totals.unrealised)} unrealised` : "Every book is flat") : "Loading…"}
            icon={<LayersRounded />}
            tone={totals.open ? statTone(totals.unrealised) : ""}
          />
        </Grid>
      </Grid>

      <Grid container spacing={2} mt={1}>
        <Grid size={{ xs: 12, md: 6, lg: 4 }} className="strategyCol">
          <StrategyCard
            title="Intraday Engine"
            subtitle="SIGNAL ENGINE • INTRADAY TRADES"
            icon={<BoltRounded />}
            accent="blue"
            route="/intraday"
            pnl={[
              { label: "Today", value: intradayPnl?.todayTrades ? intradayPnl.today : null, detail: closedDay ? closedLabel : intradayPnl ? `${intradayPnl.todayTrades} closed` : null },
              { label: monthName, value: intradayPnl?.month, detail: "this month" },
              {
                label: "Overall",
                value: intradayPnl?.overall,
                detail: intradayPnl ? `since ${shortDate(intradayPnl.first)}` : null,
                hint: "Every closed intraday trade in the history, net of charges",
              },
            ]}
            metrics={[
              [
                `Since rules ${shortDate(intraday?.since)}`,
                intraday ? signed(intraday.totalNet) : "—",
                tone(intraday?.totalNet),
              ],
              ["Win rate", winRate(intraday)],
              ["Worst day", intraday ? signed(intraday.worstDay) : "—", tone(intraday?.worstDay)],
            ]}
            trend={intradayTrend}
            trendLabel={`Cumulative net P&L, last ${intradayTrend.length} trading days`}
            note={intraday?.role ? `Status: ${intraday.role}.` : null}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6, lg: 4 }} className="strategyCol">
          <StrategyCard
            title="FADE Paper Book"
            subtitle="09:45 SHORTS • COVERED AT 15:00"
            icon={<TrendingDownRounded />}
            accent="amber"
            route="/fade"
            pnl={[
              { label: "Today", value: fadeBook?.todayTrades ? fadeBook.todayNet : null, detail: closedDay ? closedLabel : fadeBook ? `${fadeBook.todayTrades} shorts` : null },
              { label: monthName, value: fadeMonth, detail: "this month" },
              { label: "Overall", value: fadeBook?.totalNet, detail: fadeBook ? `since ${shortDate(fadeBook.since)}` : null },
            ]}
            metrics={[
              [
                "Winning days",
                fade?.record ? `${fade.record.winDays} / ${fade.record.sessions}` : "—",
              ],
              ["Worst fall", fadeBook ? signed(fadeBook.worstFall) : "—", tone(fadeBook?.worstFall)],
              [
                "News study",
                verdict
                  ? verdict.state === "collecting"
                    ? `Collecting ${verdict.sessions}/${verdict.target}`
                    : verdict.state.toUpperCase()
                  : "—",
                verdict?.state === "passed" ? "profit" : verdict?.state === "failed" ? "loss" : "",
              ],
            ]}
            trend={fadeTrend}
            trendLabel="Cumulative net P&L by session"
            note={fadeBook?.note ? `${fadeBook.note[0].toUpperCase()}${fadeBook.note.slice(1)}.` : null}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6, lg: 4 }} className="strategyCol">
          <StrategyCard
            title="Monthly Momentum"
            subtitle="TOP 30 • NIFTY FILTER • DELIVERY"
            icon={<RocketLaunchRounded />}
            accent="green"
            route="/momentum"
            badge={
              mom?.realMoneyCandidate ? (
                <Tooltip title="The only book being considered for real money">
                  <span className="booksCandidate strategyBadge">
                    <StarRounded fontSize="inherit" /> Candidate
                  </span>
                </Tooltip>
              ) : null
            }
            pnl={[
              { label: "Today", value: closedDay ? null : mom?.todayNet, detail: closedDay ? closedLabel : "at the close" },
              {
                label: monthName,
                value: momMonth,
                detail: "this month",
                hint: momMonth == null && mom ? "Needs monthNet from /analytics/account-overview" : null,
              },
              {
                label: "Overall",
                value: mom?.totalNet,
                detail: mom ? `since ${shortDate(mom.since)}` : null,
                hint: "At the last 15:40 snapshot",
              },
            ]}
            metrics={[
              [
                "Return / NIFTY",
                momentum?.started ? `${signedPct(momentum.returnPct)} / ${signedPct(momentum.niftyPct)}` : "—",
                tone(momentum?.returnPct),
              ],
              ["Invested", invested != null ? `${invested.toFixed(0)}% · ${inr(mom.longExposure)}` : "—"],
              ["Holdings", mom ? `${mom.openPositions} · ${signed(mom.unrealised)} open` : "—", tone(mom?.unrealised)],
              ["Charges paid", mom ? inr(mom.totalCharges) : "—"],
              ["Next rebalance", nextRebalance],
            ]}
            note={mom?.role ? `Status: ${mom.role}.` : null}
          />
        </Grid>
      </Grid>

      <Box mt={2}>
        <BooksOverview data={overview} error={error} loading={loading} onRefresh={load} live={live} />
      </Box>

      <Box className="pageFooter">
        <span>All times IST. Paper results only — no real orders are placed by any book.</span>
        <span>
          <span className="pulse" /> {live ? "Refreshes every minute during the session" : "Refresh to update"}
          {updatedAt ? ` · updated ${clockIST(updatedAt)}` : ""}
        </span>
      </Box>
    </Box>
  );
}
