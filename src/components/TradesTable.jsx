import React, { useEffect, useMemo, useState } from "react";
import {
  Card,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
  Typography,
  Box,
  Stack,
  Button,
} from "@mui/material";

const ROWS_PER_PAGE = 10;

const formatValue = (value) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number.toLocaleString("en-IN") : "0";
};

export default function TradesTable({
  data = [],
  title = "Recent Trades",
  emptyMessage = "No trades available.",
  historical = false,
  showDate = historical,
}) {
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [data]);

  const totalRows = Array.isArray(data) ? data.length : 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / ROWS_PER_PAGE));
  const safePage = Math.min(page, totalPages - 1);

  const paginatedData = useMemo(() => {
    if (!Array.isArray(data)) return [];
    const start = safePage * ROWS_PER_PAGE;
    return data.slice(start, start + ROWS_PER_PAGE);
  }, [data, safePage]);

  const columns = useMemo(
    () =>
      [
        showDate ? "Date" : null,
        "User",
        "Instrument",
        "Side",
        "Qty",
        "Entry",
        "LTP",
        "P/L",
        "Status",
      ].filter(Boolean),
    [showDate],
  );

  const startRow = totalRows === 0 ? 0 : safePage * ROWS_PER_PAGE + 1;
  const endRow =
    totalRows === 0 ? 0 : Math.min((safePage + 1) * ROWS_PER_PAGE, totalRows);

  const goToPage = (nextPage) => {
    const targetPage = Math.max(0, Math.min(nextPage, totalPages - 1));
    setPage(targetPage);
  };

  const getPageNumbers = () => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, index) => index);
    }

    const pages = [0];
    if (safePage > 3) pages.push("start-ellipsis");

    const rangeStart = Math.max(1, safePage - 1);
    const rangeEnd = Math.min(totalPages - 2, safePage + 1);
    for (let index = rangeStart; index <= rangeEnd; index += 1) {
      pages.push(index);
    }

    if (safePage < totalPages - 4) pages.push("end-ellipsis");
    pages.push(totalPages - 1);
    return pages;
  };

  return (
    <Card className="panel">
      <Box className="panelHead">
        <Typography variant="h6">{title}</Typography>
        <Typography variant="caption">
          {historical ? "LIVE TRADING HISTORY" : "LIVE TRADING DATA"}
        </Typography>
      </Box>

      <Box sx={{ overflowX: "auto" }}>
        <Table className="tradeTable">
          <TableHead>
            <TableRow>
              {columns.map((column) => (
                <TableCell key={column}>{column}</TableCell>
              ))}
            </TableRow>
          </TableHead>

          <TableBody>
            {paginatedData.length > 0 ? (
              paginatedData.map((trade, index) => {
                // OPEN positions come from /paper-trades/open-positions.
                // currentPnL is already calculated by the backend using the latest LTP.
                // Prefer it over any derived/stale pnl field.
                // For live/open positions, currentPnL from
                // /paper-trades/open-positions is the authoritative value.
                // Prefer it whenever the backend supplied it, regardless of
                // any status value that may have come from another payload.
                const hasCurrentPnl =
                  trade?.currentPnL !== null &&
                  trade?.currentPnL !== undefined &&
                  Number.isFinite(Number(trade.currentPnL));

                const pnl = hasCurrentPnl
                  ? Number(trade.currentPnL)
                  : Number(trade?.pnl ?? trade?.profitLoss ?? 0);
                const entry = Number(trade?.entry ?? trade?.entryPrice ?? 0);
                const current = Number(
                  trade?.current ?? trade?.currentPrice ?? trade?.exitPrice ?? 0,
                );
                const quantity = Number(trade?.qty ?? trade?.quantity ?? 0);
                const side = String(
                  trade?.side ?? trade?.signal ?? trade?.tradeType ?? "-",
                ).toUpperCase();
                const status = String(trade?.status ?? "CLOSED").toUpperCase();
                const rowKey =
                  trade?.id ??
                  trade?.tradeId ??
                  trade?.signalId ??
                  `${trade?.symbol ?? "trade"}-${safePage}-${index}`;

                return (
                  <TableRow key={rowKey}>
                    {showDate && <TableCell>{trade?.date ?? "-"}</TableCell>}
                    <TableCell>{trade?.user ?? "-"}</TableCell>
                    <TableCell>
                      <b>{trade?.symbol ?? "-"}</b>
                    </TableCell>
                    <TableCell>
                      <span className={side === "BUY" ? "buy" : "sell"}>{side}</span>
                    </TableCell>
                    <TableCell>{formatValue(quantity)}</TableCell>
                    <TableCell>₹{formatValue(entry)}</TableCell>
                    <TableCell>₹{formatValue(current)}</TableCell>
                    <TableCell className={pnl >= 0 ? "profit" : "loss"}>
                      {pnl >= 0 ? "+" : "-"}₹{formatValue(Math.abs(pnl))}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={status}
                        size="small"
                        color={status === "OPEN" ? "primary" : "default"}
                      />
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} align="center" sx={{ py: 5 }}>
                  <Typography className="muted">{emptyMessage}</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Box>

      {totalRows > 0 && (
        <Stack
          className="paginationBar"
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          alignItems="center"
          justifyContent="space-between"
        >
          <Typography variant="caption" className="muted">
            Showing {startRow}-{endRow} of {totalRows} trades
          </Typography>

          <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" justifyContent="center">
            <Button size="small" variant="outlined" disabled={safePage === 0} onClick={() => goToPage(safePage - 1)}>
              Previous
            </Button>

            {getPageNumbers().map((item) => {
              if (item === "start-ellipsis" || item === "end-ellipsis") {
                return (
                  <Typography key={item} component="span" sx={{ px: 1, color: "#7186a3" }}>
                    ...
                  </Typography>
                );
              }

              return (
                <Button
                  key={item}
                  size="small"
                  variant={item === safePage ? "contained" : "outlined"}
                  onClick={() => goToPage(item)}
                  sx={{ minWidth: 36 }}
                >
                  {item + 1}
                </Button>
              );
            })}

            <Button size="small" variant="outlined" disabled={safePage === totalPages - 1} onClick={() => goToPage(safePage + 1)}>
              Next
            </Button>
          </Stack>
        </Stack>
      )}
    </Card>
  );
}
