export const users = [
  { id: 1, name: "Ram Kumar", initial: "R", pnl: 12480, capital: 100000, trades: 28, win: 68 },
  { id: 2, name: "Anil Kumar", initial: "A", pnl: 18750, capital: 150000, trades: 34, win: 71 },
  { id: 3, name: "Priya Sharma", initial: "P", pnl: -3240, capital: 75000, trades: 19, win: 47 },
  { id: 4, name: "Vikram Rao", initial: "V", pnl: 22100, capital: 200000, trades: 41, win: 73 }
];

export const trades = [
  { id: 1, user: "Ram Kumar", symbol: "TCS", side: "BUY", qty: 10, entry: 3520, current: 3574, pnl: 540, status: "OPEN", date: "2026-08-21" },
  { id: 2, user: "Ram Kumar", symbol: "INFY", side: "BUY", qty: 20, entry: 1485, current: 1472, pnl: -260, status: "OPEN", date: "2026-08-21" },
  { id: 3, user: "Ram Kumar", symbol: "RELIANCE", side: "BUY", qty: 12, entry: 2890, current: 2934, pnl: 528, status: "OPEN", date: "2026-08-20" },
  { id: 4, user: "Ram Kumar", symbol: "HDFCBANK", side: "SELL", qty: 15, entry: 1980, current: 1948, pnl: 480, status: "CLOSED", date: "2026-08-19" },
  { id: 5, user: "Anil Kumar", symbol: "ICICIBANK", side: "BUY", qty: 25, entry: 1420, current: 1451, pnl: 775, status: "CLOSED", date: "2026-08-21" },
  { id: 6, user: "Priya Sharma", symbol: "SBIN", side: "BUY", qty: 40, entry: 820, current: 807, pnl: -520, status: "CLOSED", date: "2026-08-20" },
  { id: 7, user: "Vikram Rao", symbol: "TATAMOTORS", side: "BUY", qty: 30, entry: 720, current: 744, pnl: 720, status: "OPEN", date: "2026-08-21" }
];
