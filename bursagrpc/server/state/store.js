const seedPrices = require('../../seeds/prices.json');

const state = {
  // ── ACCOUNTS ──────────────────────────────────────────
  users: new Map(),
  // Map<trader_id, { name, cash, createdAt }>

  portfolios: new Map(),
  // Map<trader_id, Map<ticker, { qty, avgCost }>>

  tradeHistory: new Map(),
  // Map<trader_id, Array<{ ticker, side, qty, price, timestamp, pnl }>>

  // ── ORDER BOOK ────────────────────────────────────────
  orderBook: {},
  // { BBCA: { bids: [], asks: [] }, ... }

  orders: new Map(),
  // Map<order_id, { traderId, ticker, side, type, quantity, price, remainingQty, status, createdAt }>

  // ── MARKET PRICES ─────────────────────────────────────
  prices: new Map(),
  // Map<ticker, { name, current, open, high, low, volume, lastUpdated }>

  // ── STREAMING SUBSCRIBERS ─────────────────────────────
  marketSubscribers: new Set(),
  leaderboardSubscribers: new Set(),
  bidiSessions: new Map(),
};

// Initialize from seed data
for (const [ticker, data] of Object.entries(seedPrices)) {
  state.orderBook[ticker] = { bids: [], asks: [] };
  state.prices.set(ticker, {
    name: data.name,
    current: data.current,
    open: data.open,
    high: data.high,
    low: data.low,
    volume: data.volume,
    lastUpdated: Date.now(),
  });
}

module.exports = { state };
