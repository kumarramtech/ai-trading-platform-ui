import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Card,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Button,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
  Skeleton,
} from "@mui/material";
import { TableRowsRounded, InsertChartRounded } from "@mui/icons-material";
import { formatCurrency } from "../api/paperTradingApi.js";

/* =========================================================
   P&L trend — cumulative curve, daily columns, by strategy.
   One measure per view (no second axis). Profit/loss is told
   by position against the zero line and by the signed value,
   not by colour alone.
   ========================================================= */

const LINE = "#4f7cff";
const UP = "#19d39b";
const DOWN = "#ff5570";
const SURFACE = "#0b1a2b";
const HEIGHT = 250;
const M = { top: 14, right: 18, bottom: 28, left: 58 };

const RANGES = [
  ["10", "10D"],
  ["30", "1M"],
  ["90", "3M"],
  ["all", "All"],
];

const signedInr = (v) => `${v >= 0 ? "+" : "−"}${formatCurrency(Math.abs(v))}`;

function compactInr(v) {
  const a = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (a >= 100000) return `${sign}₹${(a / 100000).toFixed(a >= 1000000 ? 0 : 1)}L`;
  if (a >= 1000) return `${sign}₹${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}K`;
  return `${sign}₹${Math.round(a)}`;
}

function niceTicks(min, max, count = 4) {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const r = raw / mag;
  const step = (r >= 7.5 ? 10 : r >= 3.5 ? 5 : r >= 1.5 ? 2 : 1) * mag;
  const ticks = [];
  for (let v = Math.floor(min / step) * step; v <= Math.ceil(max / step) * step + step / 2; v += step) {
    ticks.push(Math.round(v * 100) / 100);
  }
  return ticks;
}

const shortDate = (iso) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", day: "2-digit", month: "short" }).format(
    new Date(`${iso}T00:00:00Z`),
  );

const longDate = (iso) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "short", year: "numeric" }).format(
    new Date(`${iso}T00:00:00Z`),
  );

function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** Column path: square at the zero line, 4px rounded at the data end. */
function columnPath(x, w, yZero, yValue) {
  const up = yValue < yZero;
  const h = Math.abs(yZero - yValue);
  const r = Math.min(4, w / 2, h);
  if (h < 0.5) return "";
  if (up) {
    return `M${x},${yZero}V${yValue + r}Q${x},${yValue} ${x + r},${yValue}H${x + w - r}Q${x + w},${yValue} ${x + w},${yValue + r}V${yZero}Z`;
  }
  return `M${x},${yZero}V${yValue - r}Q${x},${yValue} ${x + r},${yValue}H${x + w - r}Q${x + w},${yValue} ${x + w},${yValue - r}V${yZero}Z`;
}

function Axis({ ticks, y, width }) {
  return (
    <g className="chartAxis">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} className={t === 0 ? "zero" : ""} />
          <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end">{compactInr(t)}</text>
        </g>
      ))}
    </g>
  );
}

function xLabels(days, x) {
  const every = Math.max(1, Math.ceil(days.length / 7));
  return days.map((d, i) =>
    i % every === 0 || i === days.length - 1 ? (
      <text key={d.date} x={x(i)} y={HEIGHT - 8} textAnchor="middle" className="chartXLabel">
        {shortDate(d.date)}
      </text>
    ) : null,
  );
}

function CumulativeChart({ days, width, onHover }) {
  const [active, setActive] = useState(null);
  const base = days.length ? days[0].cum - days[0].pnl : 0;
  const series = days.map((d) => ({ ...d, value: d.cum - base }));
  const values = series.map((d) => d.value);
  const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values));
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const plotW = width - M.left - M.right;
  const plotH = HEIGHT - M.top - M.bottom;
  const x = (i) => M.left + (series.length === 1 ? plotW / 2 : (i / (series.length - 1)) * plotW);
  const y = (v) => M.top + ((hi - v) / (hi - lo)) * plotH;

  const line = series.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.value)}`).join("");
  const area = `${line}L${x(series.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
  const last = series[series.length - 1];

  const move = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const i = Math.round(((px - M.left) / plotW) * (series.length - 1));
    const index = Math.max(0, Math.min(series.length - 1, i));
    setActive(index);
    const d = series[index];
    onHover({
      x: x(index),
      y: y(d.value),
      rows: [
        ["Cumulative", signedInr(d.value), LINE],
        ["Day P&L", signedInr(d.pnl)],
        ["Trades", `${d.trades} · ${d.wins}W ${d.losses}L`],
      ],
      title: longDate(d.date),
    });
  };

  const leave = () => {
    setActive(null);
    onHover(null);
  };

  return (
    <svg width={width} height={HEIGHT} role="img" aria-label="Cumulative net P&L by day">
      <Axis ticks={ticks} y={y} width={width} />
      <path d={area} fill={LINE} opacity="0.1" />
      <path d={line} fill="none" stroke={LINE} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {xLabels(series, x)}
      {active != null && (
        <line className="crosshair" x1={x(active)} x2={x(active)} y1={M.top} y2={HEIGHT - M.bottom} />
      )}
      {last && (
        <circle cx={x(series.length - 1)} cy={y(last.value)} r="4.5" fill={LINE} stroke={SURFACE} strokeWidth="2" />
      )}
      {active != null && (
        <circle cx={x(active)} cy={y(series[active].value)} r="5" fill={LINE} stroke={SURFACE} strokeWidth="2" />
      )}
      <rect
        x={M.left}
        y={M.top}
        width={Math.max(0, plotW)}
        height={plotH}
        fill="transparent"
        onPointerMove={move}
        onPointerLeave={leave}
      />
    </svg>
  );
}

function DailyChart({ days, width, onHover }) {
  const [active, setActive] = useState(null);
  const values = days.map((d) => d.pnl);
  const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values));
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const plotW = width - M.left - M.right;
  const plotH = HEIGHT - M.top - M.bottom;
  const band = plotW / Math.max(1, days.length);
  const barW = Math.max(2, Math.min(24, band - 2));
  const x = (i) => M.left + band * i + band / 2;
  const y = (v) => M.top + ((hi - v) / (hi - lo)) * plotH;

  return (
    <svg width={width} height={HEIGHT} role="img" aria-label="Net P&L per day">
      <Axis ticks={ticks} y={y} width={width} />
      {days.map((d, i) => {
        const show = () => {
          setActive(i);
          onHover({
            x: x(i),
            y: y(Math.max(0, d.pnl)),
            title: longDate(d.date),
            rows: [
              ["Day P&L", signedInr(d.pnl), d.pnl >= 0 ? UP : DOWN],
              ["Trades", `${d.trades} · ${d.wins}W ${d.losses}L`],
              ["Win rate", `${d.winRate.toFixed(0)}%`],
            ],
          });
        };
        return (
          <g key={d.date}>
            <rect
              x={M.left + band * i}
              y={M.top}
              width={band}
              height={plotH}
              fill={active === i ? "rgba(79,124,255,.06)" : "transparent"}
              onPointerEnter={show}
              onPointerLeave={() => {
                setActive(null);
                onHover(null);
              }}
            />
            <path
              d={columnPath(x(i) - barW / 2, barW, y(0), y(d.pnl))}
              fill={d.pnl >= 0 ? UP : DOWN}
              opacity={active == null || active === i ? 1 : 0.55}
              pointerEvents="none"
            />
          </g>
        );
      })}
      {xLabels(days, x)}
    </svg>
  );
}

function StrategyBars({ strategies }) {
  const max = Math.max(1, ...strategies.map((s) => Math.abs(s.pnl)));
  return (
    <Box className="strategyBars">
      {strategies.map((s) => {
        const pct = (Math.abs(s.pnl) / max) * 50;
        return (
          <Box key={s.name} className="strategyRow" title={`${s.name}: ${signedInr(s.pnl)} over ${s.trades} trades`}>
            <Box className="strategyName">
              <b>{s.name}</b>
              <span>{s.trades} trades · {((s.wins / s.trades) * 100).toFixed(0)}% win</span>
            </Box>
            <Box className="strategyTrack">
              <span className="strategyZero" />
              <i
                className={s.pnl >= 0 ? "up" : "down"}
                style={s.pnl >= 0 ? { left: "50%", width: `${pct}%` } : { right: "50%", width: `${pct}%` }}
              />
            </Box>
            <b className="strategyValue">{signedInr(s.pnl)}</b>
          </Box>
        );
      })}
    </Box>
  );
}

function DataTable({ view, days, strategies }) {
  if (view === "strategy") {
    return (
      <TableContainer className="chartTable">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Strategy</TableCell>
              <TableCell align="right">Trades</TableCell>
              <TableCell align="right">Win rate</TableCell>
              <TableCell align="right">Net P&amp;L</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {strategies.map((s) => (
              <TableRow key={s.name}>
                <TableCell>{s.name}</TableCell>
                <TableCell align="right">{s.trades}</TableCell>
                <TableCell align="right">{((s.wins / s.trades) * 100).toFixed(0)}%</TableCell>
                <TableCell align="right" className={s.pnl >= 0 ? "profit" : "loss"}>{signedInr(s.pnl)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  }
  let cum = 0;
  return (
    <TableContainer className="chartTable">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Date</TableCell>
            <TableCell align="right">Trades</TableCell>
            <TableCell align="right">W / L</TableCell>
            <TableCell align="right">Day P&amp;L</TableCell>
            <TableCell align="right">Cumulative</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {days
            .map((d) => {
              cum += d.pnl;
              return { ...d, running: cum };
            })
            .reverse()
            .map((d) => (
              <TableRow key={d.date}>
                <TableCell>{longDate(d.date)}</TableCell>
                <TableCell align="right">{d.trades}</TableCell>
                <TableCell align="right">{d.wins} / {d.losses}</TableCell>
                <TableCell align="right" className={d.pnl >= 0 ? "profit" : "loss"}>{signedInr(d.pnl)}</TableCell>
                <TableCell align="right">{signedInr(d.running)}</TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

/**
 * Cumulative curve or daily columns with their hover tooltip.
 * days (oldest first): { date, pnl, cum, trades, wins, losses, winRate }.
 */
export function TrendChart({ view = "cumulative", days = [] }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);

  useEffect(() => setHover(null), [view, days]);

  return (
    <Box className="trendChart" ref={ref}>
      {width > 0 && (
        view === "cumulative" ? (
          <CumulativeChart days={days} width={width} onHover={setHover} />
        ) : (
          <DailyChart days={days} width={width} onHover={setHover} />
        )
      )}
      {hover && (
        <Box
          className="chartTooltip"
          style={{
            left: Math.min(Math.max(hover.x, 90), width - 90),
            top: hover.y,
          }}
        >
          <div className="tipTitle">{hover.title}</div>
          {hover.rows.map(([label, value, key]) => (
            <div key={label} className="tipRow">
              {key ? <i style={{ background: key }} /> : <i className="blank" />}
              <b>{value}</b>
              <span>{label}</span>
            </div>
          ))}
        </Box>
      )}
    </Box>
  );
}

export default function PnlTrendCard({ days = [], strategies: allStrategies = [], loading, trades = [] }) {
  const [view, setView] = useState("cumulative");
  const [range, setRange] = useState("30");
  const [asTable, setAsTable] = useState(false);

  const shown = useMemo(() => {
    if (range === "all" || !days.length) return days;
    const last = new Date(`${days[days.length - 1].date}T00:00:00Z`);
    last.setUTCDate(last.getUTCDate() - Number(range) + 1);
    const from = last.toISOString().slice(0, 10);
    return days.filter((d) => d.date >= from);
  }, [days, range]);

  // Strategy view follows the range too, rebuilt from the trades in it.
  const strategies = useMemo(() => {
    if (range === "all" || !shown.length) return allStrategies;
    const from = shown[0].date;
    const map = new Map();
    trades.forEach((t) => {
      if (t.date < from) return;
      const s = map.get(t.strategy) ?? { name: t.strategy, pnl: 0, trades: 0, wins: 0 };
      s.pnl += t.pnl;
      s.trades += 1;
      if (t.pnl > 0) s.wins += 1;
      map.set(t.strategy, s);
    });
    return [...map.values()].sort((a, b) => b.pnl - a.pnl);
  }, [range, shown, trades, allStrategies]);

  const net = shown.reduce((sum, d) => sum + d.pnl, 0);
  const green = shown.filter((d) => d.pnl > 0).length;
  const best = shown.reduce((b, d) => (!b || d.pnl > b.pnl ? d : b), null);
  const worst = shown.reduce((w, d) => (!w || d.pnl < w.pnl ? d : w), null);

  return (
    <Card className="panel trendCard">
      <Box className="panelHead trendHead">
        <Box>
          <Typography variant="h6">P&amp;L Trend</Typography>
          <Typography variant="caption">
            NET OF CHARGES AS REPORTED • CLOSED TRADES • {shown.length} TRADING DAYS
          </Typography>
        </Box>
        <Box className="trendControls">
          <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v) => v && setView(v)}>
            <ToggleButton value="cumulative">Cumulative</ToggleButton>
            <ToggleButton value="daily">Daily</ToggleButton>
            <ToggleButton value="strategy">By strategy</ToggleButton>
          </ToggleButtonGroup>
          <ToggleButtonGroup size="small" exclusive value={range} onChange={(_, v) => v && setRange(v)}>
            {RANGES.map(([v, label]) => (
              <ToggleButton key={v} value={v}>{label}</ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
      </Box>

      <Box className="trendSummary">
        <Box>
          <span>Net P&amp;L</span>
          <strong className={net >= 0 ? "profit" : "loss"}>{signedInr(net)}</strong>
        </Box>
        <Box>
          <span>Green days</span>
          <strong>{green} / {shown.length}</strong>
        </Box>
        <Box>
          <span>Best day</span>
          <strong>{best ? signedInr(best.pnl) : "—"}</strong>
          <small>{best ? shortDate(best.date) : ""}</small>
        </Box>
        <Box>
          <span>Worst day</span>
          <strong>{worst ? signedInr(worst.pnl) : "—"}</strong>
          <small>{worst ? shortDate(worst.date) : ""}</small>
        </Box>
        <Button
          size="small"
          color="inherit"
          className="tableToggle"
          startIcon={asTable ? <InsertChartRounded /> : <TableRowsRounded />}
          onClick={() => setAsTable((v) => !v)}
        >
          {asTable ? "Chart" : "Table"}
        </Button>
      </Box>

      <Box className="trendPlot">
        {loading && !days.length ? (
          <Skeleton variant="rounded" height={HEIGHT} sx={{ bgcolor: "rgba(79,124,255,.06)" }} />
        ) : !shown.length ? (
          <Box className="trendEmpty">No closed trades in this range.</Box>
        ) : asTable ? (
          <DataTable view={view} days={shown} strategies={strategies} />
        ) : view === "strategy" ? (
          <StrategyBars strategies={strategies} />
        ) : (
          <TrendChart view={view} days={shown} />
        )}
      </Box>
    </Card>
  );
}
