/**
 * Market Maker Bot
 * Places passive bid/ask orders around current price to maintain liquidity.
 * Cleans up stale bot orders before placing new ones each interval.
 */

const { BOT_ID, BOT_SPREAD_PCT, BOT_LOT_SIZE, BOT_INTERVAL_MS, TICKERS } = require('../config');
const { insertToOrderBook } = require('../state/orderBook');

function startMarketMaker(state) {
  console.log(`🤖 Market Maker Bot started (interval: ${BOT_INTERVAL_MS}ms, spread: ${BOT_SPREAD_PCT * 100}%)`);

  setInterval(() => {
    TICKERS.forEach((ticker) => {
      const priceData = state.prices.get(ticker);
      if (!priceData) return;

      const price = priceData.current;
      const bidPrice = Math.round(price * (1 - BOT_SPREAD_PCT));
      const askPrice = Math.round(price * (1 + BOT_SPREAD_PCT));
      const now = Date.now();

      // Clean up old bot orders before placing new ones
      ['bids', 'asks'].forEach((side) => {
        state.orderBook[ticker][side] = state.orderBook[ticker][side].filter(
          (o) => o.traderId !== BOT_ID
        );
      });

      const base = {
        traderId: BOT_ID,
        ticker,
        quantity: BOT_LOT_SIZE,
        type: 'LIMIT',
        remainingQty: BOT_LOT_SIZE,
        createdAt: now,
      };

      insertToOrderBook(
        { ...base, orderId: `BOT-BID-${ticker}-${now}`, side: 'BUY', price: bidPrice },
        state
      );
      insertToOrderBook(
        { ...base, orderId: `BOT-ASK-${ticker}-${now}`, side: 'SELL', price: askPrice },
        state
      );
    });
  }, BOT_INTERVAL_MS);
}

module.exports = { startMarketMaker };
