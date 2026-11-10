import React from "react";
import { Card, Box, Typography, Tooltip } from "@mui/material";

export const ACCENTS = { blue: "#4f8bff", green: "#19d39b", purple: "#9d6bff", amber: "#f2a400" };

/** 2px trend line over the last points, the latest one marked with a dot. */
export function Sparkline({ points, color, label }) {
  const w = 84;
  const h = 30;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const x = (i) => 2 + (i / (points.length - 1)) * (w - 6);
  const y = (v) => (max === min ? h / 2 : 3 + ((max - v) / (max - min)) * (h - 6));
  const d = points.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const last = points.length - 1;

  return (
    <Tooltip title={label}>
      <svg className="sparkTrend" width={w} height={h} role="img" aria-label={label}>
        <path d={`${d}L${x(last)},${h}L${x(0)},${h}Z`} fill={color} opacity="0.1" />
        <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(last)} cy={y(points[last])} r="3.5" fill={color} stroke="#0b1a2b" strokeWidth="2" />
      </svg>
    </Tooltip>
  );
}

// accent: blue | green | purple | amber — gives each KPI card its own colour.
// trend: optional numbers (oldest first) drawn as a sparkline; trendLabel describes them.
export default function StatCard({ label, value, detail, icon, tone = "", accent = "blue", trend, trendLabel }) {
  return (
    <Card className={`stat accent-${accent} ${tone}`}>
      <Box className="statIcon">{icon}</Box>
      <Box className="statBody">
        <Typography className="statLabel">{label}</Typography>
        <Typography className={`statValue ${tone}`}>{value}</Typography>
        <Typography className="statDetail">{detail}</Typography>
      </Box>
      {trend?.length > 1 && <Sparkline points={trend} color={ACCENTS[accent] ?? ACCENTS.blue} label={trendLabel ?? label} />}
    </Card>
  );
}
