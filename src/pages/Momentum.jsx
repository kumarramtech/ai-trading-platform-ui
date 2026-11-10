import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Typography,
  Grid,
  Card,
  Stack,
  Alert,
  Button,
  IconButton,
  Tooltip,
  Chip,
  LinearProgress,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
  TableSortLabel,
  Collapse,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from "@mui/material";
import {
  AccountBalanceRounded,
  CompareArrowsRounded,
  TrendingDownRounded,
  EventRounded,
  RefreshRounded,
  PlayArrowRounded,
  StopRounded,
  ShieldRounded,
  RuleRounded,
  ScheduleRounded,
  ScienceRounded,
  ExpandMoreRounded,
  ExpandLessRounded,
  SavingsRounded,
  SendRounded,
  SyncRounded,
  SwapHorizRounded,
  BoltRounded,
  ArrowUpwardRounded,
  ArrowDownwardRounded,
} from "@mui/icons-material";
import StatCard from "../components/StatCard.jsx";
import MarketClock from "../components/MarketClock.jsx";
import { useMarketStatus } from "../hooks/useMarketStatus.jsx";
import { useNow } from "../hooks/useTradeSeries.js";
import { formatCurrency } from "../api/paperTradingApi.js";
import {
  getMomentumPaper,
  getLongTermMonitor,
  getMomentumHoldings,
  getMomentumSignalPreview,
  publishMomentumSignal,
  rebalanceMomentumPaper,
  parseMomentumSignal,
  nextRebalanceDate,
} from "../api/momentumApi.js";

const PREVIEW_KEY = "ram.momentum.lastPreview";

// Locked rule and research verdicts of 2026-10-29 (swing backtest in signal-engine).
const RULES = [
  ["Universe", "200 most traded NSE stocks (point-in-time turnover)"],
  ["Ranking", "6-month return skipping the last month, ÷ volatility"],
  ["Portfolio", "Top 30, equal weight, delivery (CNC), no stops"],
  ["Market filter", "NIFTY below its 100-day average → all cash"],
  ["Idle cash", "Liquid fund, ~6.5% a year"],
  ["Rebalance", "Once a month, first trading day"],
];

const SCHEDULE = [
  ["08:50", "List computed and sent to Slack"],
  ["09:20", "Paper portfolio trades at live prices"],
  ["15:40", "Daily equity stored against NIFTY"],
];

const BACKTEST = [
  { period: "Oct 2021 – Oct 2026", strategy: 18.5, nifty: 7.5, dd: 8.8 },
  { period: "Oct 2016 – Oct 2021", strategy: 25.3, nifty: 15.7, dd: 21.5 },
];

const signed = (value, digits = 2) =>
  value == null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;

const money = (value) =>
  value == null ? "—" : `${value < 0 ? "-" : ""}${formatCurrency(Math.abs(value))}`;

const signedMoney = (value) =>
  value == null ? "—" : `${value >= 0 ? "+" : "-"}${formatCurrency(Math.abs(value))}`;

function longDate(value) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "UTC",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function monthName(value) {
  if (!value) return "";
  const date = new Date(`${value}-01T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", month: "long", year: "numeric" }).format(date);
}

function timeAgo(timestamp) {
  const minutes = Math.round((Date.now() - timestamp) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function readCachedPreview() {
  try {
    const cached = JSON.parse(localStorage.getItem(PREVIEW_KEY) ?? "null");
    if (!cached?.text) return null;
    return { signal: parseMomentumSignal(cached.text), at: cached.at };
  } catch {
    return null;
  }
}

function writeCachedPreview(text) {
  try {
    localStorage.setItem(PREVIEW_KEY, JSON.stringify({ text, at: Date.now() }));
  } catch {
    // Storage blocked: the preview still shows for this visit.
  }
}

function SymbolChips({ symbols, tone, empty = "None" }) {
  if (!symbols.length) return <Typography className="mmEmptyInline">{empty}</Typography>;
  return (
    <Box className="mmChips">
      {symbols.map((s) => (
        <span key={s} className={`mmChip ${tone ?? ""}`}>{s}</span>
      ))}
    </Box>
  );
}

function RegimeGauge({ signal }) {
  const { niftyClose, niftyAverage, smaDays, riskOn } = signal;
  if (niftyClose == null || niftyAverage == null) return null;
  const gapPct = (niftyClose / niftyAverage - 1) * 100;
  // Map -10%..+10% around the average onto the bar.
  const position = Math.max(2, Math.min(98, 50 + gapPct * 5));

  return (
    <Box className={`mmRegime ${riskOn ? "on" : "off"}`}>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1.5}>
        <Box>
          <Typography className="mmLabel">Market filter</Typography>
          <Typography className="mmRegimeState">
            {riskOn ? "Risk-on · Invest" : "Risk-off · Stay in cash"}
          </Typography>
        </Box>
        <Stack direction="row" gap={3}>
          <Box>
            <Typography className="mmLabel">NIFTY close</Typography>
            <Typography className="mmFigure">{niftyClose.toLocaleString("en-IN")}</Typography>
          </Box>
          <Box>
            <Typography className="mmLabel">{smaDays}-day average</Typography>
            <Typography className="mmFigure">{niftyAverage.toLocaleString("en-IN")}</Typography>
          </Box>
          <Box>
            <Typography className="mmLabel">Distance</Typography>
            <Typography className={`mmFigure ${gapPct >= 0 ? "profit" : "loss"}`}>{signed(gapPct)}</Typography>
          </Box>
        </Stack>
      </Stack>
      <Box className="mmGauge" aria-hidden="true">
        <span className="mmGaugeMid" />
        <span className="mmGaugeDot" style={{ left: `${position}%` }} />
      </Box>
      <Stack direction="row" justifyContent="space-between" className="mmGaugeScale">
        <span>−10% below</span>
        <span>{smaDays}-day average</span>
        <span>+10% above</span>
      </Stack>
    </Box>
  );
}

function SignalPanel({ preview, running, elapsed, onRun, onCancel, error }) {
  const signal = preview?.signal;

  return (
    <Card className="panel mmPanel">
      <Box className="panelHead">
        <Box>
          <Typography variant="h6">
            {signal?.month ? `Signal — ${monthName(signal.month)}` : "This Month's Signal"}
          </Typography>
          <Typography variant="caption">
            {signal?.signalDay
              ? `RANKED ON THE ${longDate(signal.signalDay).toUpperCase()} CLOSE${preview?.at ? ` • PREVIEWED ${timeAgo(preview.at).toUpperCase()}` : ""}`
              : "LIVE PREVIEW FROM THE LATEST CLOSES • NOT STORED OR SENT"}
          </Typography>
        </Box>
        {running ? (
          <Button size="small" variant="outlined" color="inherit" startIcon={<StopRounded />} onClick={onCancel}>
            Cancel
          </Button>
        ) : (
          <Button size="small" variant="contained" startIcon={<PlayArrowRounded />} onClick={onRun}>
            {signal ? "Re-run preview" : "Run preview"}
          </Button>
        )}
      </Box>

      {running && (
        <Box className="mmRunning">
          <LinearProgress />
          <Typography className="muted">
            Ranking the 200 most traded stocks on the server… {elapsed}s (usually about 2 minutes)
          </Typography>
        </Box>
      )}

      {error && (
        <Box px={2.5} pt={2}>
          <Alert severity="warning" className="apiAlert">Preview failed: {error}</Alert>
        </Box>
      )}

      {!signal && !running && (
        <Box className="mmEmpty">
          <ScienceRounded />
          <Typography className="mmEmptyTitle">No preview yet</Typography>
          <Typography className="muted">
            Run a preview to see what the rule would buy, keep and sell today. The official list is
            published automatically on the first trading day of the month.
          </Typography>
        </Box>
      )}

      {signal && (
        <Box className="mmPanelBody">
          <RegimeGauge signal={signal} />

          {signal.riskOn === false ? (
            <Box className="mmCash">
              <SavingsRounded />
              <Box>
                <Typography className="mmCashTitle">Hold cash in a liquid fund</Typography>
                <Typography className="muted">
                  NIFTY is below its {signal.smaDays}-day average, so the rule holds no stocks this month.
                  Next check: first trading day of next month.
                </Typography>
                {signal.sells.length > 0 && (
                  <Box mt={1.5}>
                    <Typography className="mmLabel">Sell all</Typography>
                    <SymbolChips symbols={signal.sells} tone="sell" />
                  </Box>
                )}
              </Box>
            </Box>
          ) : (
            <>
              <Grid container spacing={2} className="mmMoves">
                <Grid size={{ xs: 12, md: 4 }}>
                  <Box className="mmMoveCard">
                    <Typography className="mmLabel">Capital per stock</Typography>
                    <Typography className="mmFigure">{money(signal.slot)}</Typography>
                    <Typography className="muted">
                      {signal.stocks ?? "—"} stocks · {money(signal.capital)} total
                    </Typography>
                  </Box>
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <Box className="mmMoveCard">
                    <Typography className="mmLabel">Sell ({signal.sells.length})</Typography>
                    <SymbolChips symbols={signal.sells} tone="sell" />
                  </Box>
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <Box className="mmMoveCard">
                    <Typography className="mmLabel">Keep ({signal.keeps.length})</Typography>
                    <SymbolChips symbols={signal.keeps} />
                  </Box>
                </Grid>
              </Grid>

              <TableContainer>
                <Table size="small" className="mmTable">
                  <TableHead>
                    <TableRow>
                      <TableCell>Rank</TableCell>
                      <TableCell>Instrument</TableCell>
                      <TableCell>Side</TableCell>
                      <TableCell align="right">Qty</TableCell>
                      <TableCell align="right">Approx. price</TableCell>
                      <TableCell align="right">Amount</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {signal.buys.map((b) => (
                      <TableRow key={b.symbol}>
                        <TableCell className="mmRank">#{b.rank}</TableCell>
                        <TableCell><b>{b.symbol}</b></TableCell>
                        <TableCell><span className="buy">BUY</span></TableCell>
                        <TableCell align="right">{b.quantity}</TableCell>
                        <TableCell align="right">{formatCurrency(b.price)}</TableCell>
                        <TableCell align="right">{formatCurrency(b.amount)}</TableCell>
                      </TableRow>
                    ))}
                    {signal.buys.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="mmEmptyInline">No new buys this month.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              <Stack direction="row" justifyContent="space-between" className="mmTotals">
                <span>{signal.buys.length} buy orders · delivery (CNC) at the open</span>
                <b>Total ≈ {money(signal.buysTotal)}</b>
              </Stack>

              {signal.tooDear.length > 0 && (
                <Alert severity="info" className="mmNote">
                  Not bought — one share costs more than the {money(signal.slot)} slot:{" "}
                  {signal.tooDear.map((d) => `${d.symbol} (${formatCurrency(d.price)})`).join(", ")}
                </Alert>
              )}

              {signal.fullList.length > 0 && (
                <Box mt={2}>
                  <Typography className="mmLabel">Full list ({signal.fullList.length})</Typography>
                  <SymbolChips symbols={signal.fullList} />
                </Box>
              )}
            </>
          )}

          <RawText text={signal.raw} />
        </Box>
      )}
    </Card>
  );
}

function RawText({ text, label = "server report" }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <Box className="mmRaw">
      <Button
        size="small"
        color="inherit"
        onClick={() => setOpen((v) => !v)}
        endIcon={open ? <ExpandLessRounded /> : <ExpandMoreRounded />}
      >
        {open ? "Hide" : "Show"} {label}
      </Button>
      <Collapse in={open}>
        <pre>{text}</pre>
      </Collapse>
    </Box>
  );
}

const ACTIONS = {
  publish: {
    label: "Publish this month's list",
    icon: <SendRounded />,
    title: "Publish this month's list?",
    body: "Computes the list from the latest closes (about 2 minutes), saves it as this month's official list and sends it to Slack. If a list is already published, nothing changes.",
    confirm: "Publish & send",
  },
  force: {
    label: "Replace published list",
    icon: <SwapHorizRounded />,
    title: "Replace the published list?",
    body: "Recomputes this month's list, overwrites the one already saved and sends the new list to Slack. Use only if the published list was wrong.",
    confirm: "Replace & send",
  },
  rebalance: {
    label: "Trade list on paper now",
    icon: <SyncRounded />,
    title: "Trade this month's list on paper?",
    body: "Sells what left the list and buys the new names in the paper portfolio at live prices. Runs once per month and needs a published list. No real orders are placed.",
    confirm: "Trade on paper",
  },
};

function ActionsCard({ onDone }) {
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(null);
  const [result, setResult] = useState(null);

  const run = async (key) => {
    setPending(null);
    setBusy(key);
    setResult(null);
    try {
      if (key === "rebalance") {
        const text = await rebalanceMomentumPaper();
        setResult({ ok: true, title: "Paper rebalance done", text });
        onDone?.({});
      } else {
        const signal = await publishMomentumSignal(key === "force");
        setResult({ ok: true, title: `List ${signal.month ?? ""} published and sent to Slack`, text: signal.raw });
        onDone?.({ signal });
      }
    } catch (err) {
      setResult({ ok: false, title: "Not done", text: String(err?.message ?? err) });
    } finally {
      setBusy(null);
    }
  };

  const action = pending ? ACTIONS[pending] : null;

  return (
    <Card className="performanceCard">
      <Box className="performanceHeader">
        <Box>
          <Typography className="performanceTitle">Actions</Typography>
          <Typography className="performanceSubtitle">RUN BY THE SCHEDULER • MANUAL OVERRIDE</Typography>
        </Box>
        <BoltRounded className="panelIcon" />
      </Box>
      <Stack spacing={1} className="mmActions">
        {Object.entries(ACTIONS).map(([key, a]) => (
          <Button
            key={key}
            variant="outlined"
            color={key === "force" ? "warning" : "primary"}
            startIcon={a.icon}
            disabled={Boolean(busy)}
            onClick={() => setPending(key)}
          >
            {busy === key ? "Working…" : a.label}
          </Button>
        ))}
        {busy && <LinearProgress />}
        {result && (
          <Alert severity={result.ok ? "success" : "warning"} className="mmNote" onClose={() => setResult(null)}>
            <b>{result.title}</b>
            {result.text && <pre className="mmResultText">{result.text}</pre>}
          </Alert>
        )}
      </Stack>

      <Dialog open={Boolean(action)} onClose={() => setPending(null)} PaperProps={{ className: "mmDialog" }}>
        <DialogTitle>{action?.title}</DialogTitle>
        <DialogContent>
          <DialogContentText>{action?.body}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setPending(null)}>Cancel</Button>
          <Button variant="contained" color={pending === "force" ? "warning" : "primary"} onClick={() => run(pending)}>
            {action?.confirm}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}

const LEVEL_LABELS = { OK: "On track", WARN: "Warning", STOP: "Stop level" };

// Below half a paisa a value is "flat": neutral grey, no sign colour.
const toneOf = (v) => (v == null || Math.abs(v) < 0.005 ? "flat" : v > 0 ? "profit" : "loss");

function PctBadge({ value }) {
  if (value == null) return null;
  const tone = toneOf(value);
  return (
    <span className={`mmPctBadge ${tone}`}>
      {tone === "profit" ? <ArrowUpwardRounded /> : tone === "loss" ? <ArrowDownwardRounded /> : null}
      {Math.abs(value).toFixed(2)}%
    </span>
  );
}

function PnlTile({ label, value, pct, note, emphasis }) {
  return (
    <Box className={`mmPnlTile ${toneOf(value)} ${emphasis ? "emphasis" : ""}`}>
      <span className="mmPnlLabel">{label}</span>
      <strong className={`mmPnlValue ${toneOf(value)}`}>
        {value == null ? "—" : toneOf(value) === "flat" ? formatCurrency(0) : signedMoney(value)}
      </strong>
      <Box className="mmPnlFoot">
        <PctBadge value={pct} />
        <small>{note}</small>
      </Box>
    </Box>
  );
}

/** Live P&L from the monitor's prices: unrealised on open holdings, realised from sells, total vs start. */
function PnlSummary({ book }) {
  const priced = book.holdings.filter((h) => h.last != null);
  const up = priced.filter((h) => toneOf(h.changePct) === "profit").length;
  const down = priced.filter((h) => toneOf(h.changePct) === "loss").length;
  const flat = priced.length - up - down;

  return (
    <Box className="mmPnlBlock">
      <Box className="mmPnlGrid">
        <PnlTile
          label="Unrealised P&L"
          value={priced.length ? book.unrealised : null}
          pct={priced.length ? book.unrealisedPct : null}
          note={priced.length ? `on ${formatCurrency(book.cost)} invested` : "waiting for prices"}
          emphasis
        />
        <PnlTile label="Realised P&L" value={book.realised} note="from stocks sold" />
        <PnlTile
          label="Total P&L"
          value={book.totalPnl}
          pct={book.totalPnlPct}
          note="vs start capital, after charges"
        />
      </Box>
      {priced.length > 0 && (
        <Box className="mmBreadth" aria-label={`${up} up, ${down} down, ${flat} unchanged`}>
          <Box className="mmBreadthBar">
            {up > 0 && <i className="up" style={{ flexGrow: up }} />}
            {flat > 0 && <i className="flat" style={{ flexGrow: flat }} />}
            {down > 0 && <i className="down" style={{ flexGrow: down }} />}
          </Box>
          <Box className="mmBreadthLegend">
            <span><i className="up" />{up} up</span>
            {flat > 0 && <span><i className="flat" />{flat} unchanged</span>}
            <span><i className="down" />{down} down</span>
          </Box>
        </Box>
      )}
    </Box>
  );
}

/** Marks the symbols whose last price moved since the previous refresh, for a short flash. */
function usePriceTicks(holdings) {
  const previous = useRef(null);
  const [ticks, setTicks] = useState({});

  useEffect(() => {
    const before = previous.current;
    previous.current = Object.fromEntries(holdings.map((h) => [h.symbol, h.last]));
    if (!before) return undefined;
    const moved = {};
    holdings.forEach((h) => {
      const old = before[h.symbol];
      if (old != null && h.last != null && h.last !== old) moved[h.symbol] = h.last > old ? "tickUp" : "tickDown";
    });
    if (!Object.keys(moved).length) return undefined;
    setTicks(moved);
    const timer = setTimeout(() => setTicks({}), 1600);
    return () => clearTimeout(timer);
  }, [holdings]);

  return ticks;
}

function HoldingsTable({ holdings }) {
  const [sortByChange, setSortByChange] = useState(false);
  const ticks = usePriceTicks(holdings);
  const rows = sortByChange
    ? [...holdings].sort((a, b) => (b.changePct ?? -Infinity) - (a.changePct ?? -Infinity))
    : holdings;
  const cost = holdings.reduce((sum, h) => sum + h.entry * h.quantity, 0);
  const value = holdings.reduce((sum, h) => sum + (h.last ?? h.entry) * h.quantity, 0);
  const pnl = value - cost;

  return (
    <TableContainer className="mmHoldings">
      <Table size="small" className="mmTable">
        <TableHead>
          <TableRow>
            <TableCell>Instrument</TableCell>
            <TableCell align="right">Qty</TableCell>
            <TableCell align="right">Buy price</TableCell>
            <TableCell align="right">Last</TableCell>
            <TableCell align="right">
              <TableSortLabel
                active={sortByChange}
                direction="desc"
                onClick={() => setSortByChange((v) => !v)}
              >
                Change
              </TableSortLabel>
            </TableCell>
            <TableCell align="right">Value</TableCell>
            <TableCell align="right">Unrealised P&amp;L</TableCell>
            <TableCell>Status</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((h) => (
            <TableRow key={h.symbol}>
              <TableCell><b>{h.symbol}</b></TableCell>
              <TableCell align="right">{h.quantity}</TableCell>
              <TableCell align="right">{formatCurrency(h.entry)}</TableCell>
              <TableCell align="right" className={ticks[h.symbol] ?? ""}>
                {h.last != null ? formatCurrency(h.last) : "—"}
              </TableCell>
              <TableCell align="right" className={toneOf(h.changePct)}>
                {h.changePct != null ? signed(h.changePct) : "—"}
              </TableCell>
              <TableCell align="right">{formatCurrency((h.last ?? h.entry) * h.quantity)}</TableCell>
              <TableCell align="right" className={`${toneOf(h.pnl)} ${ticks[h.symbol] ?? ""}`}>
                <b>{h.pnl != null ? signedMoney(h.pnl) : "—"}</b>
              </TableCell>
              <TableCell>
                <span className={`mmLevel ${String(h.level ?? "none").toLowerCase()}`}>
                  {h.level ? LEVEL_LABELS[h.level] ?? h.level : "No price yet"}
                </span>
              </TableCell>
            </TableRow>
          ))}
          <TableRow className="fadeTotal">
            <TableCell colSpan={4}>{holdings.length} holdings · cost {formatCurrency(cost)}</TableCell>
            <TableCell align="right" className={toneOf(pnl)}>
              {cost ? signed((pnl / cost) * 100) : "—"}
            </TableCell>
            <TableCell align="right">{formatCurrency(value)}</TableCell>
            <TableCell align="right" className={toneOf(pnl)}>{signedMoney(pnl)}</TableCell>
            <TableCell />
          </TableRow>
        </TableBody>
      </Table>
    </TableContainer>
  );
}

const priceClock = (iso) =>
  iso
    ? `${new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", day: "2-digit", month: "short" }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`))}, ${iso.slice(11, 16)}`
    : null;

/**
 * One view of the portfolio for the panel. Prefers /momentum-paper/holdings (priced
 * after the close too); falls back to the monitor's in-memory prices plus the report.
 * The monitor's alert level is kept where it has one; otherwise it is derived from its warn %.
 */
function buildBook(holdingsView, paper, monitor) {
  const warnPct = monitor?.warnPct ?? 10;
  const levels = Object.fromEntries((monitor?.holdings ?? []).map((h) => [h.symbol, h.level]));
  const levelOf = (h) => levels[h.symbol] ?? (h.changePct == null ? null : h.changePct <= -warnPct ? "WARN" : "OK");

  if (holdingsView) {
    const holdings = holdingsView.positions.map((h) => ({ ...h, level: levelOf(h) }));
    const sources = new Set(holdings.map((h) => h.source));
    const latest = holdings.map((h) => h.priceTime).filter(Boolean).sort().at(-1);
    const unpriced = holdings.filter((h) => h.source === "NONE").length;
    return {
      holdings,
      startCapital: holdingsView.startCapital,
      cash: holdingsView.cash,
      charges: holdingsView.charges,
      realised: holdingsView.realised,
      cost: holdingsView.cost,
      equity: holdingsView.equity,
      unrealised: holdingsView.unrealised,
      unrealisedPct: holdingsView.unrealisedPct,
      totalPnl: holdingsView.totalPnl,
      totalPnlPct: holdingsView.totalPnlPct,
      live: sources.has("LIVE"),
      priceNote: `${sources.has("LIVE") && !sources.has("LAST_MINUTE") ? "Live prices" : "Last traded prices"}${latest ? ` · ${priceClock(latest)} IST` : ""}${unpriced ? ` · ${unpriced} without a price (at cost)` : ""}`,
    };
  }

  if (!monitor?.holdings.length || !paper) return null;
  const holdings = monitor.holdings.map((h) => ({ ...h, level: h.level ?? levelOf(h) }));
  const startCapital = paper.equity != null && paper.pnl != null ? paper.equity - paper.pnl : null;
  const cost = holdings.reduce((sum, h) => sum + h.entry * h.quantity, 0);
  const value = holdings.reduce((sum, h) => sum + (h.last ?? h.entry) * h.quantity, 0);
  const equity = paper.cash != null ? paper.cash + value : null;
  const totalPnl = equity != null && startCapital != null ? equity - startCapital : null;
  return {
    holdings,
    startCapital,
    cash: paper.cash,
    charges: paper.charges,
    realised: paper.realised,
    cost,
    equity,
    unrealised: value - cost,
    unrealisedPct: cost ? (value / cost - 1) * 100 : null,
    totalPnl,
    totalPnlPct: totalPnl != null && startCapital ? (totalPnl / startCapital) * 100 : null,
    live: Boolean(monitor.lastCheck),
    priceNote: monitor.lastCheck ? `Live prices · checked ${monitor.lastCheck.slice(11, 16)} IST` : "No prices yet",
  };
}

function PaperPanel({ paper, book, monitor, marketOpen }) {
  const investedPct = book?.equity ? ((book.equity - book.cash) / book.equity) * 100 : null;

  return (
    <Card className="panel mmPanel">
      <Box className="panelHead">
        <Box>
          <Typography variant="h6">Paper Portfolio</Typography>
          <Typography variant="caption">
            {paper?.started
              ? `VIRTUAL CAPITAL • SINCE ${longDate(paper.startedOn).toUpperCase()}`
              : "VIRTUAL ₹1,00,000 • SEPARATE FROM INTRADAY PAPER TRADING"}
          </Typography>
        </Box>
        <Chip
          size="small"
          className={`mmStatus ${paper?.started ? "live" : ""}`}
          label={paper?.started ? "TRACKING" : "WAITING FOR FIRST LIST"}
        />
      </Box>

      {!paper?.started ? (
        <Box className="mmEmpty">
          <AccountBalanceRounded />
          <Typography className="mmEmptyTitle">Starts with the first published list</Typography>
          <Typography className="muted">
            On {longDate(nextRebalanceDate())} the paper portfolio trades the month's list at live prices
            (0.10% slippage, delivery charges, zero brokerage). Equity is recorded daily against NIFTY.
          </Typography>
        </Box>
      ) : (
        <Box className="mmPanelBody">
          {book && <PnlSummary book={book} />}

          <Box className="mmMetricGrid">
            <Box><span>Start capital</span><strong>{money(book?.startCapital)}</strong></Box>
            <Box><span>Equity at latest prices</span><strong>{money(book?.equity)}</strong></Box>
            <Box><span>Cash</span><strong>{money(book?.cash ?? paper.cash)}</strong></Box>
            <Box><span>Charges paid</span><strong>{money(book?.charges ?? paper.charges)}</strong></Box>
          </Box>

          {investedPct != null && (
            <Box className="progressBlock mmInvested">
              <Stack direction="row" justifyContent="space-between">
                <Typography className="progressLabel">Invested</Typography>
                <Typography className="progressValue">{investedPct.toFixed(1)}%</Typography>
              </Stack>
              <LinearProgress variant="determinate" value={Math.max(0, Math.min(100, investedPct))} />
            </Box>
          )}

          <Stack direction="row" justifyContent="space-between" alignItems="baseline" flexWrap="wrap" gap={1}>
            <Typography className="mmLabel">Holdings ({book?.holdings.length ?? paper.holdings.length})</Typography>
            {book && (
              <Typography className="mmMonitorNote">
                {book.live && marketOpen && <span className="pulse" />} {book.priceNote}
                {monitor?.warnPct != null ? ` · warn at −${monitor.warnPct}%` : ""}
                {monitor?.stop ? ` · stop ${monitor.stop}` : ""}
              </Typography>
            )}
          </Stack>
          {book?.holdings.length ? (
            <HoldingsTable holdings={book.holdings} />
          ) : (
            <SymbolChips symbols={paper.holdings} empty="All cash" />
          )}
          <RawText text={paper.raw} />
          {monitor && <RawText text={monitor.raw} label="monitor report" />}
        </Box>
      )}
    </Card>
  );
}

export default function Momentum() {
  const [paper, setPaper] = useState(null);
  const [paperError, setPaperError] = useState("");
  const [loadingPaper, setLoadingPaper] = useState(true);
  const [preview, setPreview] = useState(() => readCachedPreview());
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [previewError, setPreviewError] = useState("");
  const controllerRef = useRef(null);

  const [monitor, setMonitor] = useState(null);
  const [holdingsView, setHoldingsView] = useState(null);

  const loadPaper = useCallback(async () => {
    setLoadingPaper(true);
    setPaperError("");
    const [paperResult, holdingsResult, monitorResult] = await Promise.allSettled([
      getMomentumPaper(),
      getMomentumHoldings(),
      getLongTermMonitor(),
    ]);
    if (paperResult.status === "fulfilled") setPaper(paperResult.value);
    else setPaperError(String(paperResult.reason?.message ?? paperResult.reason));
    // Holdings and monitor are optional: the panel falls back to whatever loaded.
    if (holdingsResult.status === "fulfilled") setHoldingsView(holdingsResult.value);
    if (monitorResult.status === "fulfilled") setMonitor(monitorResult.value);
    setLoadingPaper(false);
  }, []);

  const book = useMemo(() => buildBook(holdingsView, paper, monitor), [holdingsView, paper, monitor]);

  useEffect(() => {
    loadPaper();
    return () => controllerRef.current?.abort();
  }, [loadPaper]);

  useEffect(() => {
    if (!running) return undefined;
    const started = Date.now();
    setElapsed(0);
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [running]);

  const runPreview = async () => {
    const controller = new AbortController();
    controllerRef.current = controller;
    setRunning(true);
    setPreviewError("");
    try {
      const signal = await getMomentumSignalPreview({ signal: controller.signal });
      writeCachedPreview(signal.raw);
      setPreview({ signal, at: Date.now() });
    } catch (err) {
      setPreviewError(String(err?.message ?? err));
    } finally {
      setRunning(false);
      controllerRef.current = null;
    }
  };

  const actionDone = ({ signal }) => {
    if (signal) {
      writeCachedPreview(signal.raw);
      setPreview({ signal, at: Date.now() });
    }
    loadPaper();
  };

  const now = useNow(30000);
  // The monitor prices the holdings every minute; follow it while the market is open.
  const market = useMarketStatus();
  const marketOpen = market.live;
  useEffect(() => {
    if (!marketOpen) return undefined;
    const timer = setInterval(loadPaper, 60000);
    return () => clearInterval(timer);
  }, [marketOpen, loadPaper]);

  const next = nextRebalanceDate(now, market.upcomingHolidays);
  // The list goes out at 08:50 IST (03:20 UTC) on the rebalance day.
  const listAt = next.getTime() + (3 * 60 + 20) * 60000;
  const minutesLeft = Math.max(0, Math.round((listAt - now.getTime()) / 60000));
  const countdown = minutesLeft === 0
    ? "List time reached · trades at 09:20 IST"
    : minutesLeft < 24 * 60
      ? `List in ${Math.floor(minutesLeft / 60)}h ${String(minutesLeft % 60).padStart(2, "0")}m · 08:50 IST`
      : `List in ${Math.floor(minutesLeft / 1440)}d ${Math.floor((minutesLeft % 1440) / 60)}h · 08:50 IST`;
  const alpha = paper?.returnPct != null && paper?.niftyPct != null ? paper.returnPct - paper.niftyPct : null;

  return (
    <Box>
      <Box className="dashboardHeader">
        <Box className="headerGreeting">
          <Typography className="eyebrow">STRATEGY • MONTHLY MOMENTUM</Typography>
          <Typography className="pageTitle">Monthly Momentum</Typography>
          <Typography className="mmSubtitle">
            Top 30 momentum stocks, rebalanced monthly, in cash when NIFTY is weak. Manual orders only — nothing
            is traded live.
          </Typography>
        </Box>
        <Stack className="headerControls" direction="row" spacing={1.1} alignItems="center">
          <MarketClock />
          <Box className={`liveBadge ${paperError ? "offline" : ""}`}>
            <span className="pulse" /> {paperError ? "API UNREACHABLE" : "SIGNAL ENGINE CONNECTED"}
          </Box>
          <Tooltip title="Refresh paper portfolio">
            <span>
              <IconButton onClick={loadPaper} disabled={loadingPaper} className="refreshBtn">
                <RefreshRounded className={loadingPaper ? "spin" : ""} />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Box>

      {paperError && (
        <Alert className="apiAlert" severity="warning" onClose={() => setPaperError("")}>
          Paper portfolio: {paperError}
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            accent="blue"
            label="Paper Equity"
            value={book?.equity != null ? money(book.equity) : paper?.equity != null ? money(paper.equity) : "₹1,00,000"}
            detail={
              book?.equity != null
                ? `${signedMoney(book.totalPnl)} since start · latest prices`
                : paper?.equityDay
                  ? `Close of ${longDate(paper.equityDay)}`
                  : "Virtual capital, not started"
            }
            tone={book?.totalPnl != null ? toneOf(book.totalPnl).replace("profit", "positive").replace("loss", "negative").replace("flat", "") : ""}
            icon={<AccountBalanceRounded />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            accent="green"
            label="Return vs NIFTY"
            value={signed(paper?.returnPct)}
            detail={paper?.niftyPct != null ? `NIFTY ${signed(paper.niftyPct)} · alpha ${signed(alpha)}` : "Tracked from the first list"}
            icon={<CompareArrowsRounded />}
            tone={paper?.returnPct == null ? "" : paper.returnPct >= 0 ? "positive" : "negative"}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            accent="purple"
            label="Max Drawdown"
            value={paper?.maxDrawdownPct != null ? `${paper.maxDrawdownPct > 0 ? "−" : ""}${paper.maxDrawdownPct.toFixed(1)}%` : "—"}
            detail="Backtest worst: −8.8% (5 yrs)"
            icon={<TrendingDownRounded />}
            tone={paper?.maxDrawdownPct ? "negative" : ""}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            accent="amber"
            label="Next Rebalance"
            value={longDate(next).replace(/^\w+,?\s*/, "")}
            detail={countdown}
            icon={<EventRounded />}
          />
        </Grid>
      </Grid>

      <Grid container spacing={2} mt={1} alignItems="flex-start">
        <Grid size={{ xs: 12, lg: 8 }}>
          <Stack spacing={2}>
            <SignalPanel
              preview={preview}
              running={running}
              elapsed={elapsed}
              onRun={runPreview}
              onCancel={() => controllerRef.current?.abort()}
              error={previewError}
            />
            <PaperPanel paper={paper} book={book} monitor={monitor} marketOpen={marketOpen} />
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Stack spacing={2} className="sideStack">
            <ActionsCard onDone={actionDone} />

            <Card className="performanceCard">
              <Box className="performanceHeader">
                <Box>
                  <Typography className="performanceTitle">Strategy Rules</Typography>
                  <Typography className="performanceSubtitle">LOCKED 29 OCT 2026 • NO DISCRETION</Typography>
                </Box>
                <RuleRounded className="panelIcon" />
              </Box>
              <Box className="mmRules">
                {RULES.map(([k, v]) => (
                  <Box key={k} className="mmRule">
                    <span>{k}</span>
                    <b>{v}</b>
                  </Box>
                ))}
              </Box>
            </Card>

            <Card className="performanceCard">
              <Box className="performanceHeader">
                <Box>
                  <Typography className="performanceTitle">Rebalance Day</Typography>
                  <Typography className="performanceSubtitle">WEEKDAYS 1–7 OF THE MONTH • IST</Typography>
                </Box>
                <ScheduleRounded className="panelIcon" />
              </Box>
              <Box className="mmTimeline">
                {SCHEDULE.map(([time, what]) => (
                  <Box key={time} className="mmStep">
                    <span className="mmTime">{time}</span>
                    <span className="mmDot" />
                    <span>{what}</span>
                  </Box>
                ))}
              </Box>
            </Card>

            <Card className="performanceCard">
              <Box className="performanceHeader">
                <Box>
                  <Typography className="performanceTitle">Backtest Evidence</Typography>
                  <Typography className="performanceSubtitle">ANNUAL RETURN • ZERO BROKERAGE</Typography>
                </Box>
                <ShieldRounded className="panelIcon" />
              </Box>
              <Box className="mmBacktest">
                {BACKTEST.map((b) => (
                  <Box key={b.period} className="mmBtRow">
                    <Typography className="mmLabel">{b.period}</Typography>
                    <Box className="mmBars">
                      <Box className="mmBarLine">
                        <span>Strategy</span>
                        <Box className="mmBar"><i className="strategy" style={{ width: `${(b.strategy / 30) * 100}%` }} /></Box>
                        <b className="profit">+{b.strategy}%</b>
                      </Box>
                      <Box className="mmBarLine">
                        <span>NIFTY</span>
                        <Box className="mmBar"><i style={{ width: `${(b.nifty / 30) * 100}%` }} /></Box>
                        <b>+{b.nifty}%</b>
                      </Box>
                    </Box>
                    <Typography className="mmDd">Max drawdown −{b.dd}%</Typography>
                  </Box>
                ))}
                <Typography className="mmDisclaimer">
                  Simulated on historical data. ₹20 brokerage per order costs about 5–8% a year; the older period
                  carries survivorship bias. Past results do not guarantee future returns.
                </Typography>
              </Box>
            </Card>
          </Stack>
        </Grid>
      </Grid>

      <Box className="pageFooter">
        <span>All times IST. Paper results only — no live orders are placed by this strategy.</span>
      </Box>
    </Box>
  );
}
