# RAM — Risk & AI Monitor

Premium RAM trading dashboard built from the existing working project and API contract.

## Brand

**RAM — Risk & AI Monitor**

**TRADE SMART. GROW STRONG.**

## Run

```bash
npm install
npm run dev
```

## Backend address (one place)

The API address lives only in `.env` at the project root, like `application.properties`
in Spring Boot. `src/config.js` reads it and every API module imports it from there.

```env
VITE_API_BASE_URL=http://15.206.208.48:8082
```

When the EC2 IP changes, edit that line, then restart `npm run dev` (Vite reads `.env`
only at start-up) or run `npm run build` again for a production build.

## Intraday page behavior

- Today shows all completed trades for today.
- Today also has a separate **Open Trades** section underneath the completed trade history.
- A custom range ending on today includes the selected completed history plus a separate current Open Trades section.
- Historical ranges continue to use the date-range history endpoint.
- Invalid From/To ranges are blocked before an API request is made.
- Trade tables use 10 rows per page.
- Sidebar navigation remains scrollable and clickable; the promotional artwork cannot cover menu items.
- RAM artwork is positioned so the ram is clearly visible in both the sidebar and Performance Summary.

## Dashboard (`/`) and Intraday Engine (`/intraday`)

The Dashboard is the overview of all paper books: four totals (today, total, capital at work, open
positions), one card per strategy (Intraday, FADE, Monthly Momentum) linking to its page, and the
All Paper Books table. Sources: `/analytics/account-overview`, `/analytics/momentum-paper`,
`/analytics/fade-book/summary`, `/analytics/fade-news-study/summary` and the trade history for the
intraday trend; refreshes every minute during the session.

The intraday view (period filter, KPIs, P&L trend, completed and open trades, performance summary)
is its own page, **Intraday Engine** under STRATEGIES in the sidebar (`src/pages/Intraday.jsx`).

## Monthly Momentum (`/momentum`)

Strategy page for the monthly momentum list in signal-engine (branch `momentum-monthly`):
top 30 of the 200 most traded stocks by 6m-1m return / volatility, all cash while NIFTY
is below its 100-day average. The endpoints answer plain text; `src/api/momentumApi.js`
parses it and the page always offers the raw server report as well.

- `GET /analytics/momentum-paper` — paper portfolio vs NIFTY (loaded on open)
- `GET /analytics/momentum-paper/holdings` — holdings and P&L at the latest price (JSON): live in the session, last 1-minute close after it. Drives the holdings table and P&L tiles.
- `GET /analytics/long-term-monitor` — the monitor's warn/stop settings and alert level per holding; fallback prices if the holdings endpoint is down
- `GET /analytics/momentum-signal` — live preview, not saved or sent (~2 min, on demand; last result kept in this browser)
- `POST /analytics/momentum-signal/publish[?force=true]` — save the month's list and send it to Slack (confirm dialog)
- `POST /analytics/momentum-paper/rebalance` — trade the published list on paper (confirm dialog)

The scheduler does publish and rebalance by itself on weekdays 1–7 of the month (08:50 / 09:20 IST).
The main dashboard shows a Monthly Momentum card linking to the page.

## FADE Paper Book (`/fade`)

Paper-only intraday short book in signal-engine: at 09:45 it shorts the biggest movers among
turnover ranks 501-600 that are up at least 2% vs NIFTY, and covers at 15:00.

- `GET /analytics/fade-book/summary[?date=YYYY-MM-DD]` — the day's shorts and the book's record (JSON). Refreshes every minute during the session.
- `GET /analytics/fade-news-study/summary[?date=YYYY-MM-DD]` — news study (JSON): each short's news tag and headlines (News column in the shorts table), the day's no-news / with-news / untagged split, no-news vs with-news since the study began, and the verdict (`COLLECTING x/60`, then PASSED or FAILED). Shown in the **News Split** panel; if it fails, the rest of the page still loads.

Rules on the page come live from the API. The replay figures in `src/pages/FadeBook.jsx`
(`REPLAY`) are from Round 5 and are updated by hand if the study is re-run.

## All Paper Books (main dashboard)

- `GET /analytics/account-overview` — every paper book (Intraday, FADE, Monthly Momentum) side by side: today and total net P&L, charges, win rate, exposure against budget, open positions, worst day / fall, plus totals across the books and the backend notes. `src/components/BooksOverview.jsx`; refreshes every minute during the session, each row opens that book's page.

## Market status (every page)

- `GET /analytics/market-status` — NSE calendar + clock + data feed: `OPEN`, `PRE_OPEN`, `BEFORE_OPEN`, `AFTER_CLOSE`, `HOLIDAY` or `WEEKEND`, next open, feed live, next three holidays. Read once for the whole app by `MarketStatusProvider` (`src/hooks/useMarketStatus.jsx`), every minute and when the tab comes back into view. The backend decides the trading day; within one the session follows the browser clock in IST, so it switches exactly at 09:00 / 09:15 / 15:30. If the API is down, the clock alone is used (holidays unknown) and the pill says so.
- Pages refresh live only while the market is OPEN, so nothing polls on a holiday. On a holiday or weekend the Dashboard shows a banner and "Today" figures read "—"; a holiday in the next 7 days gets a heads-up. The momentum rebalance date skips known holidays.
- stock-service (`:8081/market/trading-day`, `/market/holidays`) has the same calendar but sends no CORS headers, so the browser cannot read it.

## Existing API paths

- `GET /paper-trades/pnldashboard`
- `GET /paper-trades/pnl?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD`
- `GET /paper-trades/daily-pnl`
- `GET /paper-trades/open-positions`
- `GET /paper-trades/history`
- `GET /paper-trades/historycustomdates?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD`
