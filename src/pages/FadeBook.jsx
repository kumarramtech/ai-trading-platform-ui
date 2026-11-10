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
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
  CircularProgress,
} from "@mui/material";
import {
  RefreshRounded,
  ChevronLeftRounded,
  ChevronRightRounded,
  TodayRounded,
  CurrencyRupeeRounded,
  AccountBalanceWalletRounded,
  ShowChartRounded,
  EmojiEventsRounded,
  RuleRounded,
  ScheduleRounded,
  ShieldRounded,
  ScienceRounded,
  TrendingDownRounded,
  NewspaperRounded,
  CheckCircleRounded,
  CancelRounded,
  HourglassTopRounded,
} from "@mui/icons-material";
import StatCard from "../components/StatCard.jsx";
import MarketClock, { marketSession } from "../components/MarketClock.jsx";
import { useMarketStatus, relativeDay } from "../hooks/useMarketStatus.jsx";
import { TrendChart } from "../components/PnlTrendCard.jsx";
import { useNow } from "../hooks/useTradeSeries.js";
import { formatCurrency } from "../api/paperTradingApi.js";
import {
  getFadeBook,
  getFadeNewsStudy,
  parseBookLabel,
  parsePoolLabel,
  parseVerdict,
  splitHeadlines,
  NEWS_STUDY_RULES,
} from "../api/fadeApi.js";

// The book checks its shorts every minute, at :20 past (FadePaperBookService.monitor).
const LIVE_REFRESH_MS = 60000;
// Agreed paper period before any live money: about 4 weeks.
const PAPER_TARGET_SESSIONS = 20;

// Round 5 replay of this exact book (R0), Apr 29 – Nov 3 2026, net of 0.03% slippage and charges.
const REPLAY = {
  sessions: 129,
  trades: 554,
  netBps: 19.1,
  t: 1.94,
  tBar: 2,
  h1: 29.8,
  h2: 7.9,
  perDay: 329,
  worstDay: -8571,
  hedgedPerDay: 71,
};

const SCHEDULE = [
  ["09:45", "Rank the pool against NIFTY"],
  ["09:46", "Short the biggest movers"],
  ["Every min", "Check limits on the minute candle"],
  ["15:00", "Cover everything left"],
];

const EXIT_LABELS = {
  TIME: "Time exit",
  STOP: "Stop hit",
  DAY_STOP: "Day cap hit",
  TAKE_PROFIT: "Take profit",
};

// News tags (FadeNewsTagger). Only NO_NEWS, NEWS and CATALYST count in the study.
const NEWS_TAGS = {
  NO_NEWS: { label: "No news", tone: "none", hint: "No headline about the company since 09:00 the previous weekday" },
  NEWS: { label: "News", tone: "news", hint: "Headlines about the company, none naming a concrete event" },
  CATALYST: { label: "Catalyst", tone: "catalyst", hint: "A headline names an event: results, order, approval, deal…" },
  UNTAGGED: { label: "Untagged", tone: "untagged", hint: "Not tagged at entry; left out of the study" },
  ERROR: { label: "Lookup failed", tone: "untagged", hint: "The news lookup failed; left out of the study" },
  EMPTY: { label: "No articles", tone: "untagged", hint: "No articles came back at all, which is not proof of no news; left out of the study" },
};
const tagInfo = (tag) => NEWS_TAGS[tag] ?? NEWS_TAGS.UNTAGGED;

const istDay = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

const dayFormat = (iso, options) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", ...options }).format(new Date(`${iso}T00:00:00Z`));

const longDate = (iso) => (iso ? dayFormat(iso, { weekday: "short", day: "2-digit", month: "short", year: "numeric" }) : "—");
const shortDate = (iso) => (iso ? dayFormat(iso, { day: "2-digit", month: "short" }) : "—");

const inr = (v) => (v == null ? "—" : formatCurrency(v));
const signedInr = (v) => (v == null ? "—" : `${v >= 0 ? "+" : "−"}${formatCurrency(Math.abs(v))}`);
const rupees = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inr0 = (v) => (v == null ? "—" : rupees.format(v));
const signedInr0 = (v) => (v == null ? "—" : `${v >= 0 ? "+" : "−"}${rupees.format(Math.abs(v))}`);
const signedPct = (v) => (v == null ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}%`);
const clock = (value) => (value ? String(value).slice(11, 16) : "—");
const toneOf = (v) => (v == null || v === 0 ? "" : v > 0 ? "positive" : "negative");
const pnlClass = (v) => (v > 0 ? "profit" : v < 0 ? "loss" : "");

function emptyMessage(date, today, since, now, market) {
  if (since && date < since) return `The book started on ${longDate(since)}; there is nothing before it.`;
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 6) return "Weekend: the market is closed.";
  const holiday = market?.upcomingHolidays?.find((h) => h.date === date);
  if (holiday || (date === today && market?.state === "holiday")) {
    const next = date === today && market.nextOpen ? ` The book trades again ${relativeDay(market.nextOpen, today)} at 09:45.` : "";
    return `NSE holiday (${holiday?.name ?? market.holidayName}): no session.${next}`;
  }
  if (date === today && marketSession(now).clock < "09:47") {
    return "No shorts yet. The screen runs at 09:45 IST and the shorts open at 09:46.";
  }
  return "No shorts on this date: no stock qualified, or the market was closed.";
}

function DayStrip({ book }) {
  const { trades, dayPnl, dayPnlEstimated } = book;
  // Finished day: the backend's charges. Live day: marks also carry slippage, so costs are the difference.
  const costs = dayPnlEstimated
    ? trades.reduce((sum, t) => sum + (t.entryPrice - (t.lastPrice ?? t.entryPrice)) * t.quantity, 0) - dayPnl
    : trades.reduce((sum, t) => sum + (t.charges ?? 0), 0);
  const gross = dayPnl + costs;
  const deployed = trades.reduce((sum, t) => sum + t.entryPrice * t.quantity, 0);
  const winners = trades.filter((t) => t.pnl > 0).length;

  return (
    <Box className="trendSummary fadeStrip">
      <Box>
        <span>Gross P&amp;L</span>
        <strong>{signedInr(gross)}</strong>
      </Box>
      <Box>
        <span>{dayPnlEstimated ? "Est. costs" : "Charges"}</span>
        <strong>{inr(costs)}</strong>
      </Box>
      <Box>
        <span>Net P&amp;L</span>
        <strong className={pnlClass(dayPnl)}>{signedInr(dayPnl)}</strong>
      </Box>
      <Box>
        <span>Winners</span>
        <strong>{winners} / {trades.length}</strong>
      </Box>
      <Box>
        <span>Short value</span>
        <strong>{inr0(deployed)}</strong>
      </Box>
      <Box>
        <span>NIFTY at 09:45</span>
        <strong>{signedPct(trades[0]?.niftyMovePct)}</strong>
      </Box>
    </Box>
  );
}

function ShortsTable({ trades, dayPnl, tags }) {
  const totalCharges = trades.every((t) => t.charges != null)
    ? trades.reduce((sum, t) => sum + t.charges, 0)
    : null;

  return (
    <TableContainer>
      <Table size="small" className="fadeTable">
        <TableHead>
          <TableRow>
            <TableCell>Instrument</TableCell>
            <TableCell align="right">
              <Tooltip title="Rise from the open, measured against NIFTY, when the stock was picked at 09:45">
                <span className="hasHint">Up vs NIFTY</span>
              </Tooltip>
            </TableCell>
            <TableCell>
              <Tooltip title="Tagged at 09:46 from the company's headlines. Study only: FADE shorts every candidate either way.">
                <span className="hasHint">News</span>
              </Tooltip>
            </TableCell>
            <TableCell align="right">Qty</TableCell>
            <TableCell align="right">Entry</TableCell>
            <TableCell align="right">Last / exit</TableCell>
            <TableCell align="right">
              <Tooltip title="Net P&L as a share of the short's value at entry">
                <span className="hasHint">Return</span>
              </Tooltip>
            </TableCell>
            <TableCell align="right">
              <Tooltip title="Net of slippage and charges; the charges are shown under each figure">
                <span className="hasHint">Net P&amp;L</span>
              </Tooltip>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {trades.map((t) => {
            const open = t.status === "OPEN";
            const value = t.entryPrice * t.quantity;
            return (
              <TableRow key={t.id}>
                <TableCell>
                  <b className="fadeSymbol">{t.symbol}</b>
                  <small className="fadeSub">
                    <span className="sell fadeSide">SHORT</span> rank {t.turnoverRank ?? "—"}
                  </small>
                </TableCell>
                <TableCell align="right">{signedPct(t.relMovePct)}</TableCell>
                <TableCell><NewsTag tagged={tags?.get(t.id)} /></TableCell>
                <TableCell align="right">{t.quantity}</TableCell>
                <TableCell align="right">
                  {inr(t.entryPrice)}
                  <small className="fadeSub">
                    {clock(t.entryTime)}{t.stopLoss != null ? ` · stop ${inr(t.stopLoss)}` : ""}
                  </small>
                </TableCell>
                <TableCell align="right">
                  {inr(open ? t.lastPrice : t.exitPrice)}
                  <small className="fadeSub">
                    {open ? (
                      <span className="fadeStatus open">OPEN · live</span>
                    ) : (
                      `${clock(t.exitTime)} · ${EXIT_LABELS[t.exitReason] ?? t.exitReason ?? t.status}`
                    )}
                  </small>
                </TableCell>
                <TableCell align="right">{value ? signedPct((t.pnl / value) * 100) : "—"}</TableCell>
                <TableCell align="right" className={pnlClass(t.pnl)}>
                  <b>{signedInr(t.pnl)}</b>
                  <small className="fadeSub">
                    {t.pnlEstimated ? "estimated" : t.charges != null ? `charges ${inr(t.charges)}` : ""}
                  </small>
                </TableCell>
              </TableRow>
            );
          })}
          <TableRow className="fadeTotal">
            <TableCell colSpan={7}>Day total</TableCell>
            <TableCell align="right" className={pnlClass(dayPnl)}>
              <b>{signedInr(dayPnl)}</b>
              {totalCharges != null && <small className="fadeSub">charges {inr(totalCharges)}</small>}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function NewsTag({ tagged }) {
  if (!tagged) return <span className="muted newsDash">—</span>;
  const info = tagInfo(tagged.tag);
  const headlines = splitHeadlines(tagged.headlines);
  const title = (
    <Box className="newsTip">
      <b>{info.label}</b>
      <span>{info.hint}</span>
      {headlines.length > 0 && (
        <ul>
          {headlines.slice(0, 5).map((h) => <li key={h}>{h}</li>)}
          {headlines.length > 5 && <li>+{headlines.length - 5} more</li>}
        </ul>
      )}
    </Box>
  );
  return (
    <Tooltip title={title} arrow>
      <span className={`newsTag ${info.tone}`}>
        {info.label}
        {headlines.length > 0 && <small>{headlines.length}</small>}
      </span>
    </Tooltip>
  );
}

const winRate = (g) => (g?.trades ? `${Math.round((g.winners / g.trades) * 100)}% win` : "no trades");
const perTrade = (g) => (g?.trades ? g.pnl / g.trades : null);

/** One group's tile: P&L, trades, winners, and its share of the day's shorts. */
function SplitTile({ label, hint, group, total, tone }) {
  const share = total ? (group.trades / total) * 100 : 0;
  return (
    <Box className={`newsTile ${tone}`}>
      <Tooltip title={hint}>
        <span className="newsTileLabel hasHint">{label}</span>
      </Tooltip>
      <strong className={group.trades ? pnlClass(group.pnl) : ""}>{group.trades ? signedInr0(group.pnl) : "—"}</strong>
      <small>
        {group.trades} short{group.trades === 1 ? "" : "s"} · {group.winners} won
      </small>
      <Box className="newsShare" aria-label={`${share.toFixed(0)}% of the shorts`}>
        <i style={{ width: `${share}%` }} />
      </Box>
    </Box>
  );
}

/** NO_NEWS vs with-news since the study began, on one shared scale. */
function HeadToHead({ since }) {
  const rows = [
    { key: "noNews", label: "No news", tone: "none", g: since.noNews },
    { key: "withNews", label: "With news", tone: "news", g: since.withNews },
  ];
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.g.pnl)));
  return (
    <Box className="newsH2H" role="table" aria-label="No news against with news since the study began">
      <Box className="newsH2HRow head" role="row">
        <span role="columnheader">Group</span>
        <span role="columnheader">Net P&amp;L</span>
        <span role="columnheader">Shorts</span>
        <span role="columnheader">Per short</span>
        <span role="columnheader">Win rate</span>
      </Box>
      {rows.map(({ key, label, tone, g }) => {
        const width = (Math.abs(g.pnl) / max) * 50;
        return (
          <Box key={key} className="newsH2HRow" role="row">
            <span role="cell"><span className={`newsTag ${tone}`}>{label}</span></span>
            <span role="cell" className="newsBarCell">
              <span className="newsBar">
                <i className={g.pnl >= 0 ? "up" : "down"} style={{ width: `${width}%` }} />
              </span>
              <b className={pnlClass(g.pnl)}>{g.trades ? signedInr0(g.pnl) : "—"}</b>
            </span>
            <span role="cell">{g.trades}</span>
            <span role="cell" className={pnlClass(perTrade(g))}>{g.trades ? signedInr0(perTrade(g)) : "—"}</span>
            <span role="cell">{g.trades ? winRate(g).replace(" win", "") : "—"}</span>
          </Box>
        );
      })}
    </Box>
  );
}

const PASS_MARK = [
  `No-news shorts earn at least +${NEWS_STUDY_RULES.minBps} bps net a trade`,
  `…with t ≥ ${NEWS_STUDY_RULES.minT} (not luck)`,
  "Positive on both NIFTY up and NIFTY down days",
  "Beat the shorts that had news",
];

function NewsStudyPanel({ study, error, date, today }) {
  if (!study) {
    return (
      <Card className="panel mmPanel">
        <Box className="panelHead">
          <Box>
            <Typography variant="h6">News Split</Typography>
            <Typography variant="caption">STUDY ONLY • FADE STILL TRADES EVERY SHORT</Typography>
          </Box>
          <NewspaperRounded className="panelIcon" />
        </Box>
        <Box className="trendEmpty">{error ? `News study: ${error}` : <CircularProgress size={24} />}</Box>
      </Card>
    );
  }

  const { today: day, sinceStart, studySessions, studySince } = study;
  const verdict = parseVerdict(study.verdict);
  const target = verdict.target ?? NEWS_STUDY_RULES.minSessions;
  const sessions = verdict.sessions ?? studySessions ?? 0;
  const progress = Math.min(100, (sessions / target) * 100);
  const total = day.all.trades;
  const allUntagged = total > 0 && day.untagged.trades === total;
  const dayLabel = date === today ? "Today" : shortDate(date);
  const VerdictIcon = verdict.state === "passed" ? CheckCircleRounded : verdict.state === "failed" ? CancelRounded : HourglassTopRounded;

  return (
    <Card className="panel mmPanel">
      <Box className="panelHead trendHead">
        <Box>
          <Typography variant="h6">News Split</Typography>
          <Typography variant="caption">STUDY ONLY • WOULD A NO-NEWS-ONLY BOOK DO BETTER?</Typography>
        </Box>
        <Tooltip title={verdict.text}>
          <span className={`newsVerdict ${verdict.state}`}>
            <VerdictIcon fontSize="inherit" />
            {verdict.state === "collecting" ? `Collecting ${sessions}/${target}` : verdict.state.toUpperCase()}
          </span>
        </Tooltip>
      </Box>

      <Box className="newsBody">
        <Typography className="newsSection">
          {dayLabel}: FADE {total ? signedInr0(day.all.pnl) : "—"} from {total} short{total === 1 ? "" : "s"}
        </Typography>
        <Box className="newsTiles">
          <SplitTile label="If no-news only" hint={NEWS_TAGS.NO_NEWS.hint} group={day.noNews} total={total} tone="none" />
          <SplitTile label="With news" hint="News or catalyst headlines at entry" group={day.withNews} total={total} tone="news" />
          <SplitTile label="Untagged" hint="No tag, lookup failed or no articles: left out of the study" group={day.untagged} total={total} tone="untagged" />
        </Box>
        {allUntagged && (
          <Typography className="mmDisclaimer newsNote">
            None of these shorts were tagged, so they don't count in the study. Shorts are tagged at 09:46, from the day
            the study started.
          </Typography>
        )}

        <Typography className="newsSection">
          Since the study began{studySince ? ` · ${longDate(studySince)}` : ""}
        </Typography>
        {studySessions > 0 ? (
          <HeadToHead since={sinceStart} />
        ) : (
          <Typography className="muted newsEmpty">
            No tagged session yet. The comparison starts with the first session whose shorts were tagged at entry.
          </Typography>
        )}

        <Box className="newsStudyFoot">
          <Box className="progressBlock">
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography className="progressLabel">Sessions collected</Typography>
              <Typography className="progressValue">{sessions} / {target}</Typography>
            </Stack>
            <LinearProgress variant="determinate" value={progress} />
            <Typography className="mmDisclaimer fadeCapNote">
              {verdict.state === "collecting"
                ? `No conclusion until ${target} sessions: ${Math.max(0, target - sessions)} to go.`
                : verdict.text}
            </Typography>
          </Box>
          <Box className="newsPassMark">
            <Typography className="progressLabel">Pass mark, fixed before any data</Typography>
            <ul>
              {PASS_MARK.map((rule) => (
                <li key={rule} className={verdict.state}>
                  {/* FAILED does not say which rule missed, so no per-rule cross. */}
                  {verdict.state === "failed" ? <span className="newsBullet" /> : <VerdictIcon fontSize="inherit" />}
                  {rule}
                </li>
              ))}
            </ul>
          </Box>
        </Box>

        <Typography className="mmDisclaimer newsNote">
          Idea: a jump with no news tends to reverse, a jump on news tends to keep going (Chan, 2003). This only measures
          it; FADE's rules don't change until the study passes.
        </Typography>
      </Box>
    </Card>
  );
}

function RecordPanel({ days, selected, onSelect }) {
  const [view, setView] = useState("cumulative");

  const series = useMemo(() => {
    let cum = 0;
    return days.map((d) => {
      cum += d.net;
      return {
        date: d.date,
        pnl: d.net,
        cum,
        trades: d.trades,
        wins: d.winners,
        losses: d.trades - d.winners,
        winRate: d.trades ? (d.winners / d.trades) * 100 : 0,
      };
    });
  }, [days]);

  return (
    <Card className="panel mmPanel">
      <Box className="panelHead trendHead">
        <Box>
          <Typography variant="h6">Book Record</Typography>
          <Typography variant="caption">
            FINISHED SESSIONS • NET OF SLIPPAGE AND CHARGES • PICK A SESSION TO OPEN IT
          </Typography>
        </Box>
        <Box className="trendControls">
          <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v) => v && setView(v)}>
            <ToggleButton value="cumulative">Cumulative</ToggleButton>
            <ToggleButton value="daily">Daily</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Box>

      {series.length === 0 ? (
        <Box className="trendEmpty">The record starts after the first finished session.</Box>
      ) : (
        <>
          <Box className="trendPlot"><TrendChart view={view} days={series} /></Box>
          <TableContainer className="chartTable fadeSessions">
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Session</TableCell>
                  <TableCell align="right">Shorts</TableCell>
                  <TableCell align="right">Winners</TableCell>
                  <TableCell align="right">Net P&amp;L</TableCell>
                  <TableCell align="right">Cumulative</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {[...series].reverse().map((d) => (
                  <TableRow
                    key={d.date}
                    hover
                    selected={d.date === selected}
                    tabIndex={0}
                    className="fadeSessionRow"
                    onClick={() => onSelect(d.date)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onSelect(d.date);
                    }}
                  >
                    <TableCell>{longDate(d.date)}</TableCell>
                    <TableCell align="right">{d.trades}</TableCell>
                    <TableCell align="right">{d.wins}</TableCell>
                    <TableCell align="right" className={pnlClass(d.pnl)}>{signedInr(d.pnl)}</TableCell>
                    <TableCell align="right">{signedInr(d.cum)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </Card>
  );
}

function RulesCard({ book }) {
  const settings = parseBookLabel(book?.book);
  const pool = parsePoolLabel(book?.pool);

  const rows = settings && pool
    ? [
        ["Pool", `Turnover ranks ${pool.from}–${pool.to}`],
        ["Trigger", `Up ≥ ${pool.minMove}% vs NIFTY at 09:45${pool.extra ? `, ${pool.extra}` : ""}`],
        ["Positions", `${settings.positions ? `${settings.positions} biggest movers` : "Every candidate"}, ${inr0(settings.notional)} each`],
        ["Stock stop", settings.stop ? `${settings.stop} above entry` : "None"],
        ["Day cap", settings.dayCap ? `${inr0(settings.dayCap)}, then cover all` : "None"],
        ...(settings.takeProfit ? [["Take profit", `${inr0(settings.takeProfit)} on the day`]] : []),
        ["Market", settings.niftyUpOnly ? "Only when NIFTY is up" : "Up and down days"],
        ["Exit", "Cover at 15:00"],
      ]
    : [["Book", book?.book ?? "—"], ["Pool", book?.pool ?? "—"]];

  return (
    <Card className="performanceCard">
      <Box className="performanceHeader">
        <Box>
          <Typography className="performanceTitle">Book Rules</Typography>
          <Typography className="performanceSubtitle">LIVE SETTINGS FROM THE SIGNAL ENGINE</Typography>
        </Box>
        <RuleRounded className="panelIcon" />
      </Box>
      <Box className="mmRules">
        {rows.map(([k, v]) => (
          <Box key={k} className="mmRule">
            <span>{k}</span>
            <b>{v}</b>
          </Box>
        ))}
      </Box>
    </Card>
  );
}

function DayCapCard({ book }) {
  const cap = parseBookLabel(book?.book)?.dayCap;
  if (!cap) return null;
  const used = Math.max(0, -(book?.dayPnl ?? 0));
  const pct = Math.min(100, (used / cap) * 100);
  const level = pct >= 75 ? "danger" : pct >= 50 ? "warn" : "ok";

  return (
    <Card className="performanceCard">
      <Box className="performanceHeader">
        <Box>
          <Typography className="performanceTitle">Day Loss Cap</Typography>
          <Typography className="performanceSubtitle">{longDate(book?.date).toUpperCase()}</Typography>
        </Box>
        <ShieldRounded className="panelIcon" />
      </Box>
      <Box className={`progressBlock fadeCap ${level}`}>
        <Stack direction="row" justifyContent="space-between" alignItems="baseline">
          <Typography className="fadeCapUsed">{inr(used)}</Typography>
          <Typography className="progressLabel">of {inr0(cap)} ({pct.toFixed(0)}%)</Typography>
        </Stack>
        <LinearProgress variant="determinate" value={pct} />
        <Typography className="mmDisclaimer fadeCapNote">
          At the cap every short is covered and the book stops for the day. Triggered on{" "}
          {book?.record?.dayStops ?? 0} of {book?.record?.sessions ?? 0} sessions so far.
        </Typography>
      </Box>
    </Card>
  );
}

function ScheduleCard({ date, today, now, market }) {
  const session = marketSession(now);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const noSession = market.state === "holiday" || market.state === "weekend";
  const running = date === today && weekday >= 1 && weekday <= 5 && !noSession;
  const t = session.clock;
  const stateOf = (time) => {
    if (!running) return "";
    if (time === "Every min") return t >= "09:46" && t < "15:00" ? "now" : t >= "15:00" ? "done" : "";
    return t >= time ? "done" : "";
  };

  return (
    <Card className="performanceCard">
      <Box className="performanceHeader">
        <Box>
          <Typography className="performanceTitle">Trading Day</Typography>
          <Typography className="performanceSubtitle">
            {noSession
              ? `NO SESSION TODAY • ${market.state === "holiday" ? market.holidayName?.toUpperCase() ?? "NSE HOLIDAY" : "WEEKEND"}`
              : "TRADING DAYS • IST • RUNS BY ITSELF"}
          </Typography>
        </Box>
        <ScheduleRounded className="panelIcon" />
      </Box>
      <Box className="mmTimeline fadeTimeline">
        {SCHEDULE.map(([time, what]) => (
          <Box key={time} className={`mmStep ${stateOf(time)}`}>
            <span className="mmTime">{time}</span>
            <span className="mmDot" />
            <span>{what}</span>
          </Box>
        ))}
      </Box>
    </Card>
  );
}

function EvidenceCard({ record }) {
  const sessions = record?.sessions ?? 0;
  const progress = Math.min(100, (sessions / PAPER_TARGET_SESSIONS) * 100);
  const left = Math.max(0, PAPER_TARGET_SESSIONS - sessions);

  return (
    <Card className="performanceCard">
      <Box className="performanceHeader">
        <Box>
          <Typography className="performanceTitle">Paper vs Replay</Typography>
          <Typography className="performanceSubtitle">IS THE PAPER BOOK MATCHING THE TEST?</Typography>
        </Box>
        <ScienceRounded className="panelIcon" />
      </Box>

      <Box className="fadeCompare">
        <Box className="fadeCompareRow head">
          <span />
          <span>Replay</span>
          <span>Paper</span>
        </Box>
        <Box className="fadeCompareRow">
          <span>Sessions</span>
          <b>{REPLAY.sessions}</b>
          <b>{sessions}</b>
        </Box>
        <Box className="fadeCompareRow">
          <span>Average per day</span>
          <b>{signedInr0(REPLAY.perDay)}</b>
          <b>{sessions ? signedInr0(record.perSession) : "—"}</b>
        </Box>
        <Box className="fadeCompareRow">
          <span>Worst day</span>
          <b>{signedInr0(REPLAY.worstDay)}</b>
          <b>{sessions ? signedInr0(record.worstDay) : "—"}</b>
        </Box>
      </Box>

      <Box className="progressBlock">
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography className="progressLabel">Paper period</Typography>
          <Typography className="progressValue">{sessions} / {PAPER_TARGET_SESSIONS} sessions</Typography>
        </Stack>
        <LinearProgress variant="determinate" value={progress} />
        <Typography className="mmDisclaimer fadeCapNote">
          {left > 0
            ? `${left} more sessions before the record says much; a few days can swing either way.`
            : "Paper period complete: compare the record above with the replay."}
        </Typography>
      </Box>

      <Box className="fadeReplayNote">
        <Alert severity="warning" className="mmNote">
          <b>Replay did not clear its own bar:</b> t {REPLAY.t} against the required {REPLAY.tBar}.
        </Alert>
        <Typography className="mmDisclaimer">
          {REPLAY.trades} trades, net +{REPLAY.netBps} bps a trade, fading from +{REPLAY.h1} in the first half to
          +{REPLAY.h2} in the second. Hedged with NIFTY it earns only {signedInr0(REPLAY.hedgedPerDay)} a day, so much
          of the profit is market direction rather than stock selection. Simulated results do not guarantee future
          returns.
        </Typography>
      </Box>
    </Card>
  );
}

export default function FadeBook() {
  const now = useNow(30000);
  const today = istDay(now);
  const [date, setDate] = useState(today);
  const [book, setBook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [study, setStudy] = useState(null);
  const [studyError, setStudyError] = useState("");
  const latest = useRef(0);

  const load = useCallback(async () => {
    const id = ++latest.current;
    setLoading(true);
    // The news study is a side view: if it fails, the book still shows.
    const [bookResult, studyResult] = await Promise.allSettled([getFadeBook(date), getFadeNewsStudy(date)]);
    if (id !== latest.current) return;
    if (bookResult.status === "fulfilled") {
      setBook(bookResult.value);
      setError("");
      setUpdatedAt(new Date());
    } else {
      setError(String(bookResult.reason?.message ?? bookResult.reason));
    }
    if (studyResult.status === "fulfilled") {
      setStudy(studyResult.value);
      setStudyError("");
    } else {
      setStudyError(String(studyResult.reason?.message ?? studyResult.reason));
    }
    setLoading(false);
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  // Follow the book while today's session or a short is live; past days do not change.
  const shown = book?.date === date ? book : null;
  const market = useMarketStatus();
  const sessionOpen = market.live;
  const live = date === today && (sessionOpen || (shown?.openTrades ?? 0) > 0);

  useEffect(() => {
    if (!live) return undefined;
    const timer = setInterval(load, LIVE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [live, load]);

  const record = book?.record;
  const sessionDays = record?.days ?? [];
  const earlier = [...sessionDays].reverse().find((d) => d.date < date)?.date;
  const later = sessionDays.find((d) => d.date > date)?.date ?? (date < today ? today : null);
  const trades = shown?.trades ?? [];

  const trend = useMemo(() => {
    let cum = 0;
    return sessionDays.map((d) => (cum += d.net));
  }, [sessionDays]);

  const dayPnl = shown?.dayPnl;
  const shownStudy = study?.date === date ? study : null;
  const tags = useMemo(() => new Map((shownStudy?.trades ?? []).map((t) => [t.id, t])), [shownStudy]);

  return (
    <Box>
      <Box className="dashboardHeader">
        <Box className="headerGreeting">
          <Typography className="eyebrow">STRATEGY • INTRADAY SHORT FADE</Typography>
          <Typography className="pageTitle">FADE Paper Book</Typography>
          <Typography className="mmSubtitle">
            At 09:45 it shorts the mid-size stocks that have run furthest ahead of NIFTY and covers at 15:00. Paper
            only: no real orders, and separate from the intraday engine.
          </Typography>
        </Box>
        <Stack className="headerControls" direction="row" spacing={1.1} alignItems="center">
          <MarketClock />
          <Box className={`liveBadge ${error ? "offline" : ""}`}>
            <span className="pulse" /> {error ? "API UNREACHABLE" : "SIGNAL ENGINE CONNECTED"}
          </Box>
          <Tooltip title="Refresh">
            <span>
              <IconButton onClick={load} disabled={loading} className="refreshBtn">
                <RefreshRounded className={loading ? "spin" : ""} />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Box>

      {error && (
        <Alert className="apiAlert" severity="warning" onClose={() => setError("")}>
          FADE book: {error}
        </Alert>
      )}
      {book && !book.enabled && (
        <Alert className="apiAlert" severity="info">
          The FADE book is switched off in the signal engine, so it opens no new shorts. The record below stays available.
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            accent="green"
            label={date === today ? "Today's P&L" : "Day P&L"}
            value={trades.length ? signedInr(dayPnl) : "—"}
            detail={
              !shown
                ? "Loading…"
                : shown.dayPnlEstimated
                  ? `Live estimate · ${shown.openTrades} open`
                  : trades.length
                    ? `Final · ${shortDate(date)}`
                    : `No shorts · ${shortDate(date)}`
            }
            icon={<CurrencyRupeeRounded />}
            tone={toneOf(dayPnl)}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            accent="blue"
            label="Book Total"
            value={record ? signedInr(record.total) : "—"}
            detail={record?.since ? `Since ${shortDate(record.since)}` : "No finished session yet"}
            icon={<AccountBalanceWalletRounded />}
            tone={toneOf(record?.total)}
            trend={trend}
            trendLabel="Cumulative net P&L by session"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            accent="purple"
            label="Average per Session"
            value={record?.sessions ? signedInr(record.perSession) : "—"}
            detail={`Replay: ${signedInr0(REPLAY.perDay)} a day`}
            icon={<ShowChartRounded />}
            tone={toneOf(record?.sessions ? record.perSession : null)}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            accent="amber"
            label="Winning Days"
            value={record ? `${record.winDays} / ${record.sessions}` : "—"}
            detail={record?.sessions ? `Best ${signedInr0(record.bestDay)} · worst ${signedInr0(record.worstDay)}` : "Waiting for the first session"}
            icon={<EmojiEventsRounded />}
          />
        </Grid>
      </Grid>

      <Grid container spacing={2} mt={1} alignItems="flex-start">
        <Grid size={{ xs: 12, lg: 8 }}>
          <Stack spacing={2}>
            <Card className="panel mmPanel">
              <Box className="panelHead trendHead">
                <Box>
                  <Typography variant="h6">Shorts — {longDate(date)}</Typography>
                  <Typography variant="caption">
                    {live ? "LIVE • REFRESHES EVERY MINUTE" : "PAPER TRADES • NET OF SLIPPAGE AND CHARGES"}
                    {updatedAt ? ` • UPDATED ${new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true }).format(updatedAt).toUpperCase()}` : ""}
                  </Typography>
                </Box>
                <Box className="fadeDateNav">
                  <Tooltip title={earlier ? `Previous session: ${shortDate(earlier)}` : "No earlier session"}>
                    <span>
                      <IconButton size="small" aria-label="Previous session" disabled={!earlier} onClick={() => setDate(earlier)}>
                        <ChevronLeftRounded />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <TextField
                    size="small"
                    type="date"
                    value={date}
                    onChange={(e) => e.target.value && e.target.value <= today && setDate(e.target.value)}
                    slotProps={{ htmlInput: { max: today, "aria-label": "Session date" } }}
                  />
                  <Tooltip title={later ? `Next: ${shortDate(later)}` : "This is the latest day"}>
                    <span>
                      <IconButton size="small" aria-label="Next session" disabled={!later} onClick={() => setDate(later)}>
                        <ChevronRightRounded />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Button size="small" color="inherit" startIcon={<TodayRounded />} disabled={date === today} onClick={() => setDate(today)}>
                    Today
                  </Button>
                </Box>
              </Box>

              {!shown ? (
                <Box className="trendEmpty">
                  {error ? "Could not load this session." : <CircularProgress size={26} />}
                </Box>
              ) : trades.length === 0 ? (
                <Box className="mmEmpty">
                  <TrendingDownRounded />
                  <Typography className="mmEmptyTitle">No shorts to show</Typography>
                  <Typography className="muted">{emptyMessage(date, today, record?.since, now, market)}</Typography>
                </Box>
              ) : (
                <>
                  <DayStrip book={shown} />
                  <ShortsTable trades={trades} dayPnl={shown.dayPnl} tags={shownStudy ? tags : null} />
                </>
              )}
            </Card>

            <NewsStudyPanel study={shownStudy} error={studyError} date={date} today={today} />

            {record && <RecordPanel days={sessionDays} selected={date} onSelect={setDate} />}
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Stack spacing={2} className="sideStack">
            <EvidenceCard record={record} />
            {shown && <DayCapCard book={shown} />}
            <RulesCard book={book} />
            <ScheduleCard date={date} today={today} now={now} market={market} />
          </Stack>
        </Grid>
      </Grid>

      <Box className="pageFooter">
        <span>All times IST. Paper results only — no real orders are placed by this book.</span>
        <span>
          <span className="pulse" /> {live ? "Refreshes every minute during the session" : "Refresh to update"}
        </span>
      </Box>
    </Box>
  );
}
