import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Typography,
  Grid,
  Card,
  LinearProgress,
  Stack,
  Alert,
  CircularProgress,
  FormControl,
  Select,
  MenuItem,
  TextField,
  Button,
  IconButton,
  Tooltip,
} from "@mui/material";
import {
  AccountBalanceWalletRounded,
  TrendingUpRounded,
  ShowChartRounded,
  TrackChangesRounded,
  RefreshRounded,
  CalendarMonthRounded,
  QueryStatsRounded,
  EmojiEventsRounded,
  TrendingDownRounded,
} from "@mui/icons-material";
import { useTradeSeries } from "../hooks/useTradeSeries.js";
import PnlTrendCard from "../components/PnlTrendCard.jsx";
import MarketClock from "../components/MarketClock.jsx";

const SPARK_DAYS = 14;
import StatCard from "../components/StatCard.jsx";
import TradesTable from "../components/TradesTable.jsx";
import {
  paperTradingApi,
  formatCurrency,
  normalizePosition,
  normalizeHistoryTrade,
} from "../api/paperTradingApi.js";
import ramMountain from "../assets/ram-mountain-performance.png";

function formatDateIST(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function todayIST() {
  return formatDateIST(new Date());
}

function displayDate(value) {
  if (!value) return "-";
  const p = String(value).split("-");
  if (p.length !== 3) return value;
  return `${p[2]} ${new Date(`${value}T00:00:00`).toLocaleString("en-IN", {
    month: "short",
  })} ${p[0]}`;
}

function rangeFor(period) {
  const now = new Date();
  const to = formatDateIST(now);
  const from = new Date(now);
  if (period === "5days") from.setDate(from.getDate() - 4);
  if (period === "10days") from.setDate(from.getDate() - 9);
  if (period === "1month") from.setMonth(from.getMonth() - 1);
  return { fromDate: formatDateIST(from), toDate: to };
}

function arrayFrom(response, keys) {
  if (Array.isArray(response)) return response;
  for (const key of keys) {
    if (Array.isArray(response?.[key])) return response[key];
  }
  return [];
}

function apiError(err) {
  const message = String(err?.message || err || "Unknown error");
  if (message.includes("Unexpected token '<'") || message.includes("<!doctype")) {
    return "The API request reached a web page instead of JSON. Check the API base URL/proxy configuration.";
  }
  return message;
}

function mergeTradeRows(historyRows, openRows) {
  const result = [];
  const seen = new Set();

  [...historyRows, ...openRows].forEach((row) => {
    const key = String(
      row?.id ??
        `${row?.symbol ?? "trade"}|${row?.entryTime ?? ""}|${row?.exitTime ?? ""}|${row?.qty ?? ""}|${row?.side ?? ""}`,
    );
    if (seen.has(key)) return;
    seen.add(key);
    result.push(row);
  });

  return result.sort((a, b) => {
    const aTime = new Date(a?.exitTime ?? a?.entryTime ?? 0).getTime();
    const bTime = new Date(b?.exitTime ?? b?.entryTime ?? 0).getTime();
    return bTime - aTime;
  });
}

function isOpenRow(row) {
  return String(row?.status ?? "").toUpperCase() === "OPEN";
}

const pnlText = (v) => (Math.abs(v) < 0.005 ? formatCurrency(0) : `${v > 0 ? "+" : "-"}${formatCurrency(Math.abs(v))}`);
const pnlTone = (v) => (Math.abs(v) < 0.005 ? "" : v > 0 ? "positive" : "negative");

function clockIST(date) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(date);
}

export default function Intraday() {
  const [period, setPeriod] = useState("today");
  const [fromDate, setFromDate] = useState(todayIST());
  const [toDate, setToDate] = useState(todayIST());
  const [appliedFrom, setAppliedFrom] = useState("");
  const [appliedTo, setAppliedTo] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);

  // Re-read the history at most once a minute while the dashboard refreshes.
  const series = useTradeSeries(updatedAt ? Math.floor(updatedAt.getTime() / 60000) : 0);
  const recent = series.days.slice(-SPARK_DAYS);

  const invalid = Boolean(fromDate && toDate && fromDate > toDate);
  const customApplied = period === "custom" && appliedFrom && appliedTo;
  const selectedRange = period === "custom"
    ? { fromDate: appliedFrom, toDate: appliedTo }
    : period === "today"
      ? rangeFor("today")
      : period === "all"
        ? null
        : rangeFor(period);

  const load = useCallback(async () => {
    if (period === "custom" && (!appliedFrom || !appliedTo || appliedFrom > appliedTo)) {
      return;
    }

    setRefreshing(true);
    setError("");

    try {
      let pnlPromise;
      let historyPromise = Promise.resolve([]);
      let positionsPromise = Promise.resolve([]);

      if (period === "all") {
        pnlPromise = paperTradingApi.getPnlDashboard();
        historyPromise = paperTradingApi.getHistory();
      } else if (period === "today") {
        const r = rangeFor("today");
        pnlPromise = paperTradingApi.getPnlByDateRange(r.fromDate, r.toDate);
        // The date-filtered history endpoint can omit same-day completed trades.
        // Use the complete history feed for Today, then filter it locally.
        historyPromise = paperTradingApi.getHistory();
        positionsPromise = paperTradingApi.getOpenPositions();
      } else if (period === "custom") {
        pnlPromise = paperTradingApi.getPnlByDateRange(appliedFrom, appliedTo);
        // When the range contains today, use the full history feed so today's
        // completed trades are not lost, then merge current open positions.
        if (appliedFrom <= todayIST() && appliedTo >= todayIST()) {
          historyPromise = paperTradingApi.getHistory();
          positionsPromise = paperTradingApi.getOpenPositions();
        } else {
          historyPromise = paperTradingApi.getHistoryByDateRange(appliedFrom, appliedTo);
        }
      } else {
        const r = rangeFor(period);
        pnlPromise = paperTradingApi.getPnlByDateRange(r.fromDate, r.toDate);
        historyPromise = paperTradingApi.getHistoryByDateRange(r.fromDate, r.toDate);
      }

      const [pnlResult, historyResult, positionsResult] = await Promise.allSettled([
        pnlPromise,
        historyPromise,
        positionsPromise,
      ]);

      setConnected(pnlResult.status === "fulfilled" || historyResult.status === "fulfilled");
      setUpdatedAt(new Date());

      if (pnlResult.status === "fulfilled") {
        setDashboard(pnlResult.value);
      } else {
        setError(`P&L service: ${apiError(pnlResult.reason)}`);
      }

      let historyRows = [];
      let openRows = [];

      if (historyResult.status === "fulfilled") {
        historyRows = arrayFrom(historyResult.value, ["trades", "history", "data"]).map(
          normalizeHistoryTrade,
        );
      } else if (period !== "all") {
        setError((prev) =>
          prev
            ? `${prev} | Trade history: ${apiError(historyResult.reason)}`
            : `Trade history: ${apiError(historyResult.reason)}`,
        );
      }

      if (positionsResult.status === "fulfilled") {
        openRows = arrayFrom(positionsResult.value, ["positions", "data"]).map(
          normalizePosition,
        );
      } else {
        setError((prev) =>
          prev
            ? `${prev} | Open positions: ${apiError(positionsResult.reason)}`
            : `Open positions: ${apiError(positionsResult.reason)}`,
        );
      }

      // The complete history feed is used whenever a selected range includes today.
      // Filter it locally by the selected dates so custom-today contains ALL completed
      // trades from today, not just currently open positions.
      const filteredHistory = period === "all"
        ? historyRows
        : historyRows.filter((row) => {
            const value = String(row?.exitTime ?? row?.entryTime ?? "").slice(0, 10);
            if (!value) return false;
            if (period === "today") {
              const today = todayIST();
              return value === today;
            }
            if (period === "custom") {
              return value >= appliedFrom && value <= appliedTo;
            }
            const range = rangeFor(period);
            return value >= range.fromDate && value <= range.toDate;
          });

      // The full history feed can contain OPEN rows with stale/realized P&L = 0.
      // For today's/custom-today dashboard, those rows must NOT win over the
      // live /open-positions payload, which contains the authoritative currentPnL.
      // Keep only completed history rows here, then merge the live open rows.
      const completedHistory = filteredHistory.filter((row) => !isOpenRow(row));

      const merged = period === "all"
        ? historyRows
        : mergeTradeRows(completedHistory, openRows);

      setRows(merged);
    } catch (err) {
      setError(apiError(err));
      setConnected(false);
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period, appliedFrom, appliedTo]);

  useEffect(() => {
    if (period === "custom" && !customApplied) {
      setLoading(false);
      setRows([]);
      return undefined;
    }

    load();
    if (period !== "today") return undefined;
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load, period, customApplied]);

  const handlePeriod = (value) => {
    setPeriod(value);
    setError("");
    if (value === "custom") {
      const t = todayIST();
      setFromDate(t);
      setToDate(t);
      setAppliedFrom("");
      setAppliedTo("");
    } else {
      setAppliedFrom("");
      setAppliedTo("");
    }
  };

  const applyCustom = () => {
    if (!fromDate || !toDate) {
      setError("Please select both From Date and To Date.");
      return;
    }
    if (fromDate > toDate) {
      setError("From Date cannot be greater than To Date.");
      return;
    }
    setAppliedFrom(fromDate);
    setAppliedTo(toDate);
  };

  const totalTrades = Number(dashboard?.totalTrades ?? 0);
  const winning = Number(dashboard?.winningTrades ?? 0);
  const losing = Number(dashboard?.losingTrades ?? 0);
  const breakeven = Number(dashboard?.breakevenTrades ?? 0);
  const winRate = Math.max(
    0,
    Math.min(
      100,
      Number(
        dashboard?.winRate ??
          (totalTrades ? (winning / totalTrades) * 100 : 0),
      ),
    ),
  );

  const tablePnl = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row?.pnl ?? row?.profitLoss ?? 0), 0),
    [rows],
  );

  const apiPnl = Number(dashboard?.todayProfit ?? dashboard?.totalProfit ?? 0);
  const effectivePnl = rows.length > 0 ? tablePnl : apiPnl;

  const derivedStats = useMemo(() => {
    const completed = rows.filter((r) => !isOpenRow(r));
    const profits = completed.map((r) => Number(r?.pnl ?? r?.profitLoss ?? 0));
    const wins = profits.filter((p) => p > 0);
    const losses = profits.filter((p) => p < 0);

    return {
      best: wins.length ? Math.max(...wins) : null,
      worst: losses.length ? Math.min(...losses) : null,
      averageWin: wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : null,
      averageLoss: losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : null,
    };
  }, [rows]);

  const periodText = period === "today"
    ? displayDate(todayIST())
    : period === "all"
      ? "Overall"
      : period === "5days"
        ? "Last 5 Days"
        : period === "10days"
          ? "Last 10 Days"
          : period === "1month"
            ? "Last 1 Month"
            : appliedFrom === appliedTo
              ? displayDate(appliedFrom)
              : `${displayDate(appliedFrom)} — ${displayDate(appliedTo)}`;

  const today = todayIST();
  const selectedRangeIncludesToday = period === "today" || (
    period === "custom" && appliedFrom && appliedTo && appliedFrom <= today && appliedTo >= today
  );
  const todaySelected = period === "today" || (
    period === "custom" && appliedFrom === today && appliedTo === today
  );

  const title = todaySelected
    ? "Completed Trades — Today"
    : `Trades Traded — ${periodText}`;

  const pnlSourceText = rows.length > 0 ? "From selected trades" : "From P&L service";
  const openTradeRows = rows.filter(isOpenRow);
  const completedTradeRows = rows.filter((r) => !isOpenRow(r));
  const openCount = openTradeRows.length;
  const isTodayDashboard = todaySelected;

  if (loading && !dashboard && rows.length === 0) {
    return (
      <Box className="loadingScreen">
        <CircularProgress />
        <Typography>Loading intraday trades…</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box className="dashboardHeader">
        <Box className="headerGreeting">
          <Typography className="eyebrow">STRATEGY • INTRADAY ENGINE</Typography>
          <Typography className="pageTitle">Intraday Engine</Typography>
          <Typography className="mmSubtitle">
            The signal engine's intraday trades: entries, exits and P&amp;L by session. Paper only, rules frozen
            until about 60 trades.
          </Typography>
        </Box>

        <Stack
          className="headerControls"
          direction={{ xs: "column", lg: "row" }}
          spacing={1.1}
          alignItems={{ xs: "stretch", lg: "center" }}
        >
          <FormControl size="small" className="periodSelect">
            <Select value={period} onChange={(e) => handlePeriod(e.target.value)}>
              <MenuItem value="today">Today</MenuItem>
              <MenuItem value="5days">Last 5 Days</MenuItem>
              <MenuItem value="10days">Last 10 Days</MenuItem>
              <MenuItem value="1month">Last 1 Month</MenuItem>
              <MenuItem value="all">Overall</MenuItem>
              <MenuItem value="custom">Custom Range</MenuItem>
            </Select>
          </FormControl>

          {period === "custom" && (
            <>
              <TextField
                size="small"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                error={invalid}
                inputProps={{ "aria-label": "From date" }}
              />
              <TextField
                size="small"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                error={invalid}
                inputProps={{ min: fromDate || undefined, "aria-label": "To date" }}
              />
              <Button
                variant="contained"
                onClick={applyCustom}
                disabled={!fromDate || !toDate || invalid}
              >
                APPLY
              </Button>
            </>
          )}

          <MarketClock />
          <Box className={`liveBadge ${connected ? "" : "offline"}`}>
            <span className="pulse" /> {connected ? "LIVE API CONNECTED" : "API UNREACHABLE"}
          </Box>
          <Tooltip title={updatedAt ? `Last updated ${clockIST(updatedAt)} IST` : "Refresh data"}>
            <IconButton onClick={load} disabled={refreshing} className="refreshBtn">
              <RefreshRounded className={refreshing ? "spin" : ""} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>

      {error && (
        <Alert className="apiAlert" severity="warning" onClose={() => setError("")}>
          {error}
        </Alert>
      )}
      {invalid && (
        <Alert className="apiAlert" severity="error">
          From Date cannot be greater than To Date.
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            accent="blue"
            label="Total Trades"
            value={totalTrades}
            detail={period === "today" ? "All trades today" : `Selected: ${periodText}`}
            icon={<AccountBalanceWalletRounded />}
            trend={recent.map((d) => d.trades)}
            trendLabel={`Trades per day, last ${recent.length} trading days`}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            accent="green"
            label="Total P&L"
            value={pnlText(effectivePnl)}
            detail={pnlSourceText}
            icon={<TrendingUpRounded />}
            trend={recent.map((d) => d.cum)}
            trendLabel={`Cumulative net P&L, last ${recent.length} trading days`}
            tone={pnlTone(effectivePnl)}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          {isTodayDashboard ? (
            <StatCard
              accent="purple"
              label="Open Trades"
              value={openCount}
              detail="Currently active"
              icon={<ShowChartRounded />}
            />
          ) : (
            <StatCard
              accent="purple"
              label="Period P&L"
              value={pnlText(effectivePnl)}
              detail="Selected period"
              icon={<ShowChartRounded />}
              trend={recent.map((d) => d.pnl)}
              trendLabel={`Net P&L per day, last ${recent.length} trading days`}
              tone={pnlTone(effectivePnl)}
            />
          )}
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            accent="amber"
            label="Win Rate"
            value={`${winRate.toFixed(2)}%`}
            detail={`${winning} wins • ${losing} losses`}
            icon={<TrackChangesRounded />}
            trend={recent.map((d) => d.winRate)}
            trendLabel={`Win rate per day, last ${recent.length} trading days`}
          />
        </Grid>
      </Grid>

      <Box mt={2}>
        <PnlTrendCard
          days={series.days}
          strategies={series.strategies}
          trades={series.trades}
          loading={series.loading}
        />
      </Box>

      <Grid container spacing={2} mt={1} alignItems="flex-start">
        <Grid size={{ xs: 12, lg: 8 }}>
          <TradesTable
            data={completedTradeRows}
            title={title}
            emptyMessage={todaySelected ? "No completed trades found for today." : "No trades found for this period."}
            historical={true}
            showDate={!todaySelected}
          />
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Stack spacing={2} className="sideStack">
          <Card className="performanceCard">
            <Box className="performanceHeader">
              <Box>
                <Typography className="performanceTitle">Performance Summary</Typography>
                <Typography className="performanceSubtitle">
                  {periodText.toUpperCase()} • PERFORMANCE SNAPSHOT
                </Typography>
              </Box>
              <CalendarMonthRounded className="panelIcon" />
            </Box>

            <Box className="performanceHero">
              <Box className="performanceHeroCopy">
                <Typography className={`bigPnl ${pnlTone(effectivePnl)}`}>
                  {pnlText(effectivePnl)}
                </Typography>
                <Typography className="muted">Net P&amp;L</Typography>
                <Box className="performanceSource">{pnlSourceText}</Box>
              </Box>
              <Box className="performanceArt">
                <img src={ramMountain} alt="RAM mountain and ram" />
                <Box className="performanceArtOverlay" />
              </Box>
            </Box>

            <Box className="performanceStats">
              <Box className="performanceStat">
                <span>Total Trades</span>
                <strong>{totalTrades}</strong>
              </Box>
              <Box className="performanceStat">
                <span>Win Rate</span>
                <strong>{winRate.toFixed(2)}%</strong>
              </Box>
              <Box className="performanceStat winningStat">
                <span>Winning</span>
                <strong>{winning}</strong>
              </Box>
              <Box className="performanceStat losingStat">
                <span>Losing</span>
                <strong>{losing}</strong>
              </Box>
            </Box>

            <Box className="performanceMetrics">
              <Box className="metricRow">
                <Stack direction="row" spacing={1} alignItems="center">
                  <EmojiEventsRounded fontSize="small" />
                  <span>Best Trade</span>
                </Stack>
                <b className="profit">
                  {derivedStats.best != null
                    ? `+${formatCurrency(derivedStats.best)}`
                    : dashboard?.bestTrade != null
                      ? `+${formatCurrency(Math.abs(Number(dashboard.bestTrade)))} `
                      : "—"}
                </b>
              </Box>
              <Box className="metricRow">
                <Stack direction="row" spacing={1} alignItems="center">
                  <TrendingDownRounded fontSize="small" />
                  <span>Worst Trade</span>
                </Stack>
                <b className="loss">
                  {derivedStats.worst != null
                    ? formatCurrency(derivedStats.worst)
                    : dashboard?.worstTrade != null
                      ? `-${formatCurrency(Math.abs(Number(dashboard.worstTrade)))}`
                      : "—"}
                </b>
              </Box>
              <Box className="metricRow">
                <Stack direction="row" spacing={1} alignItems="center">
                  <QueryStatsRounded fontSize="small" />
                  <span>Average Win</span>
                </Stack>
                <b>
                  {derivedStats.averageWin != null
                    ? formatCurrency(derivedStats.averageWin)
                    : dashboard?.averageProfit != null
                      ? formatCurrency(Number(dashboard.averageProfit))
                      : "—"}
                </b>
              </Box>
              <Box className="metricRow">
                <Stack direction="row" spacing={1} alignItems="center">
                  <TrendingDownRounded fontSize="small" />
                  <span>Average Loss</span>
                </Stack>
                <b className="loss">
                  {derivedStats.averageLoss != null
                    ? formatCurrency(derivedStats.averageLoss)
                    : dashboard?.averageLoss != null
                      ? formatCurrency(Number(dashboard.averageLoss))
                      : "—"}
                </b>
              </Box>
              <Box className="metricRow">
                <span>Open Trades</span>
                <b>{dashboard?.openTrades ?? openCount}</b>
              </Box>
            </Box>

            <Box className="progressBlock">
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography className="progressLabel">Win Rate</Typography>
                <Typography className="progressValue">{winRate.toFixed(2)}%</Typography>
              </Stack>
              <LinearProgress variant="determinate" value={winRate} color="success" />
            </Box>

            <Box className="performanceFooter">
              <span><b className="profit">{winning}</b> Winning</span>
              <span><b className="loss">{losing}</b> Losing</span>
              <span><b>{breakeven}</b> Breakeven</span>
            </Box>
          </Card>
          </Stack>
        </Grid>
      </Grid>

      {todaySelected && (
        <Box className="openTradesBottom" mt={2}>
          <TradesTable
            data={openTradeRows}
            title="Open Trades — Today"
            emptyMessage="No open trades right now."
            historical={false}
            showDate={false}
          />
        </Box>
      )}

      <Box className="pageFooter">
        <span>All times IST. Paper trading results — not investment advice.</span>
        <span>
          <span className="pulse" />{" "}
          {period === "today" ? "Auto-refreshes every 30 seconds" : "Refresh to update"}
          {updatedAt ? ` · updated ${clockIST(updatedAt)}` : ""}
        </span>
      </Box>
    </Box>
  );
}
