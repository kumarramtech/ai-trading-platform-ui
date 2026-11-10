import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Card,
  Typography,
  Tooltip,
  IconButton,
  CircularProgress,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
} from "@mui/material";
import { LayersRounded, RefreshRounded, ChevronRightRounded, StarRounded } from "@mui/icons-material";
// Where each book has its own page.
export const BOOK_ROUTES = {
  INTRADAY: "/intraday",
  FADE: "/fade",
  "MONTHLY MOMENTUM": "/momentum",
};

export const BOOK_LABELS = {
  INTRADAY: "Intraday Engine",
  FADE: "FADE Short Book",
  "MONTHLY MOMENTUM": "Monthly Momentum",
};

const rupees = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
// Under half a rupee is shown as a neutral ₹0, never "+₹0" or "−₹0".
const flat = (v) => v == null || Math.abs(v) < 0.5;
const inr = (v) => (v == null ? "—" : rupees.format(Math.abs(v) < 0.5 ? 0 : v));
const signed = (v) => (v == null ? "—" : flat(v) ? rupees.format(0) : `${v > 0 ? "+" : "−"}${rupees.format(Math.abs(v))}`);
const tone = (v) => (flat(v) ? "" : v > 0 ? "profit" : "loss");
const shortDate = (iso) =>
  iso
    ? new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", day: "2-digit", month: "short" }).format(new Date(`${iso}T00:00:00Z`))
    : "—";

function ExposureBar({ book }) {
  const used = (book.longExposure ?? 0) + (book.shortExposure ?? 0);
  const pct = book.budget ? Math.min(100, (used / book.budget) * 100) : 0;
  const label = !used
    ? "Flat"
    : [book.longExposure ? `L ${inr(book.longExposure)}` : null, book.shortExposure ? `S ${inr(book.shortExposure)}` : null]
        .filter(Boolean)
        .join(" · ");
  return (
    <Tooltip title={book.budgetNote ?? ""}>
      <Box className="booksExposure">
        <span>{label}</span>
        <Box className="booksMeter" aria-label={`${pct.toFixed(0)}% of the budget in use`}>
          <i className={book.shortExposure > book.longExposure ? "short" : ""} style={{ width: `${pct}%` }} />
        </Box>
        <small>{pct.toFixed(0)}% of {inr(book.budget)}</small>
      </Box>
    </Tooltip>
  );
}

/** All paper books side by side (data from /analytics/account-overview, fetched by the page). */
export default function BooksOverview({ data, error, loading, onRefresh, live }) {
  const navigate = useNavigate();
  const books = data?.books ?? [];
  const todayCharges = books.reduce((sum, b) => sum + (b.todayCharges ?? 0), 0);

  return (
    <Card className="panel booksPanel">
      <Box className="panelHead">
        <Box>
          <Typography variant="h6">All Paper Books</Typography>
          <Typography variant="caption">
            {data?.paperOnly === false ? "" : "PAPER ONLY • NO REAL ORDERS • "}NET OF CHARGES
            {data?.date ? ` • ${shortDate(data.date).toUpperCase()}` : ""}
            {live ? " • REFRESHES EVERY MINUTE" : ""}
          </Typography>
        </Box>
        <Box className="booksHeadRight">
          <LayersRounded className="panelIcon" />
          <Tooltip title="Refresh">
            <span>
              <IconButton size="small" onClick={onRefresh} disabled={loading} className="refreshBtn" aria-label="Refresh books">
                <RefreshRounded className={loading ? "spin" : ""} fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>

      {!data ? (
        <Box className="trendEmpty">{error ? `Account overview: ${error}` : <CircularProgress size={24} />}</Box>
      ) : (
        <>
          <Box className="trendSummary booksTotals">
            <Box>
              <span>Today, all books</span>
              <strong className={tone(data.todayNet)}>{signed(data.todayNet)}</strong>
            </Box>
            <Box>
              <span>Total, all books</span>
              <strong className={tone(data.totalNet)}>{signed(data.totalNet)}</strong>
            </Box>
            <Box>
              <Tooltip title={`Today ${inr(todayCharges)}`}>
                <span className="hasHint">Charges paid</span>
              </Tooltip>
              <strong>{inr(data.totalCharges)}</strong>
            </Box>
            <Box>
              <span>Long / short exposure</span>
              <strong>
                {inr(data.longExposure)} <em className="booksSlash">/</em> {inr(data.shortExposure)}
              </strong>
            </Box>
            <Box>
              <Tooltip title="Largest drop from a high in the combined P&L of all books">
                <span className="hasHint">Worst fall, combined</span>
              </Tooltip>
              <strong className={tone(data.worstFallCombined)}>{signed(data.worstFallCombined)}</strong>
            </Box>
          </Box>

          <TableContainer>
            <Table size="small" className="booksTable">
              <TableHead>
                <TableRow>
                  <TableCell>Book</TableCell>
                  <TableCell align="right">Today</TableCell>
                  <TableCell align="right">Total</TableCell>
                  <TableCell align="right">
                    <Tooltip title="Winning closed trades out of all closed trades">
                      <span className="hasHint">Win rate</span>
                    </Tooltip>
                  </TableCell>
                  <TableCell>Exposure</TableCell>
                  <TableCell align="right">
                    <Tooltip title="Open positions and their P&L at the latest price">
                      <span className="hasHint">Open</span>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Worst single day, and the largest drop from a high">
                      <span className="hasHint">Worst day / fall</span>
                    </Tooltip>
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {books.map((b) => {
                  const route = BOOK_ROUTES[b.book];
                  return (
                    <TableRow
                      key={b.book}
                      hover={Boolean(route)}
                      className={route ? "booksRow link" : "booksRow"}
                      onClick={route ? () => navigate(route) : undefined}
                    >
                      <TableCell>
                        <Box className="booksName">
                          <b>{BOOK_LABELS[b.book] ?? b.book}</b>
                          {b.realMoneyCandidate && (
                            <Tooltip title="The only book being considered for real money">
                              <span className="booksCandidate">
                                <StarRounded fontSize="inherit" /> Real-money candidate
                              </span>
                            </Tooltip>
                          )}
                        </Box>
                        <small className="booksSub">{b.role}</small>
                        {b.note && <small className="booksNote">{b.note}</small>}
                      </TableCell>
                      <TableCell align="right">
                        <b className={tone(b.todayNet)}>{b.todayTrades ? signed(b.todayNet) : "—"}</b>
                        <small className="booksSub">
                          {b.todayTrades} trade{b.todayTrades === 1 ? "" : "s"}
                          {b.todayCharges ? ` · chg ${inr(b.todayCharges)}` : ""}
                        </small>
                      </TableCell>
                      <TableCell align="right">
                        <b className={tone(b.totalNet)}>{signed(b.totalNet)}</b>
                        <small className="booksSub">
                          since {shortDate(b.since)} · {b.sessions} session{b.sessions === 1 ? "" : "s"}
                        </small>
                      </TableCell>
                      <TableCell align="right">
                        {b.trades ? `${Math.round((b.winners / b.trades) * 100)}%` : "—"}
                        <small className="booksSub">
                          {b.trades ? `${b.winners} / ${b.trades} closed` : "nothing closed yet"}
                        </small>
                      </TableCell>
                      <TableCell>
                        <ExposureBar book={b} />
                      </TableCell>
                      <TableCell align="right">
                        {b.openPositions}
                        <small className={`booksSub ${b.openPositions ? tone(b.unrealised) : ""}`}>
                          {b.openPositions ? `${signed(b.unrealised)} open P&L` : "none"}
                        </small>
                      </TableCell>
                      <TableCell align="right">
                        <span className={tone(b.worstDay)}>{signed(b.worstDay)}</span>
                        <small className={`booksSub ${tone(b.worstFall)}`}>fall {signed(b.worstFall)}</small>
                      </TableCell>
                      <TableCell padding="none" className="booksGo">
                        {route && <ChevronRightRounded />}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          {data.notes?.length > 0 && (
            <ul className="booksNotes">
              {data.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}
