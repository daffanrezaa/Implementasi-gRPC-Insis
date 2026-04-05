/**
 * Broadcaster
 * Pushes market updates and leaderboard to all active streaming subscribers.
 * Handles dead connection cleanup automatically.
 */

const { changePct } = require('./priceEngine');
const { getEquity } = require('../state/portfolio');
const { STARTING_BALANCE, BOT_ID } = require('../config');

function broadcastMarketUpdate(ticker, state) {
  if (state.marketSubscribers.size === 0) return;

  const p = state.prices.get(ticker);
  const book = state.orderBook[ticker];

  const update = {
    ticker,
    price: p.current,
    bid: book.bids[0]?.price ?? p.current,
    ask: book.asks[0]?.price ?? p.current,
    volume: p.volume,
    change_pct: changePct(ticker, state),
    high: p.high,
    low: p.low,
    timestamp: Date.now(),
  };

  const dead = [];
  for (const sub of state.marketSubscribers) {
    try {
      // Filter by watched tickers (set in WatchMarket handler)
      const watched = sub._bursaWatchTickers;
      if (watched && watched.length > 0 && !watched.includes(ticker)) {
        continue;
      }
      sub.write(update);
    } catch (err) {
      dead.push(sub);
    }
  }
  dead.forEach((s) => state.marketSubscribers.delete(s));
}

function broadcastLeaderboard(state) {
  if (state.leaderboardSubscribers.size === 0) return;

  const entries = [];
  for (const [id, user] of state.users) {
    if (id === BOT_ID) continue;
    const { totalEquity } = getEquity(id, state);
    entries.push({
      trader_name: user.name,
      total_equity: totalEquity,
      return_pct: ((totalEquity - STARTING_BALANCE) / STARTING_BALANCE) * 100,
      total_trades: state.tradeHistory.get(id)?.length ?? 0,
    });
  }

  entries.sort((a, b) => b.total_equity - a.total_equity);
  const ranked = entries.map((e, i) => ({ rank: i + 1, ...e }));
  const update = { entries: ranked, timestamp: Date.now() };

  const dead = [];
  for (const sub of state.leaderboardSubscribers) {
    try {
      sub.write(update);
    } catch {
      dead.push(sub);
    }
  }
  dead.forEach((s) => state.leaderboardSubscribers.delete(s));
}

module.exports = { broadcastMarketUpdate, broadcastLeaderboard };
