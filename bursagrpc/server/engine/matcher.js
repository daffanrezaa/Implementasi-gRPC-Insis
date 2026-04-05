/**
 * Matching Engine — Price-Time Priority (FIFO)
 * Standard algorithm used by real stock exchanges.
 * BUY matches ASK if ask_price <= order_price (or any price if MARKET).
 * SELL matches BID if bid_price >= order_price (or any price if MARKET).
 * Fill price = resting order's price (price improvement for aggressor).
 */

const { insertToOrderBook } = require('../state/orderBook');
const { updatePortfolio } = require('../state/portfolio');
const { updateMarketPrice } = require('./priceEngine');
const { broadcastMarketUpdate } = require('./broadcaster');

function matchOrder(newOrder, state) {
  const book = state.orderBook[newOrder.ticker];
  const opposite = newOrder.side === 'BUY' ? book.asks : book.bids;

  const canMatch = (resting) => {
    if (newOrder.type === 'MARKET') return true;
    return newOrder.side === 'BUY'
      ? resting.price <= newOrder.price
      : resting.price >= newOrder.price;
  };

  let filledQty = 0;
  let totalValue = 0;

  while (
    newOrder.remainingQty > 0 &&
    opposite.length > 0 &&
    canMatch(opposite[0])
  ) {
    const resting = opposite[0];
    const execQty = Math.min(newOrder.remainingQty, resting.remainingQty);
    const execPrice = resting.price;

    newOrder.remainingQty -= execQty;
    resting.remainingQty -= execQty;
    filledQty += execQty;
    totalValue += execQty * execPrice;

    // Update both traders' portfolios
    updatePortfolio(
      newOrder.traderId,
      newOrder.side,
      execQty,
      execPrice,
      newOrder.ticker,
      state
    );
    const oppSide = newOrder.side === 'BUY' ? 'SELL' : 'BUY';
    updatePortfolio(
      resting.traderId,
      oppSide,
      execQty,
      execPrice,
      newOrder.ticker,
      state
    );

    // Update resting order status
    if (resting.remainingQty === 0) {
      opposite.shift();
      const restingRecord = state.orders.get(resting.orderId);
      if (restingRecord) restingRecord.status = 'FILLED';
    } else {
      const restingRecord = state.orders.get(resting.orderId);
      if (restingRecord) restingRecord.status = 'PARTIALLY_FILLED';
    }
  }

  // Update market price and broadcast if any fills occurred
  if (filledQty > 0) {
    const avgPrice = totalValue / filledQty;
    updateMarketPrice(newOrder.ticker, avgPrice, filledQty, state);
    broadcastMarketUpdate(newOrder.ticker, state);
  }

  // LIMIT: remainder goes to order book | MARKET: remainder is CANCELLED
  if (newOrder.remainingQty > 0 && newOrder.type === 'LIMIT') {
    insertToOrderBook(newOrder, state);
  }

  // Determine final status
  let status;
  if (filledQty === 0) {
    status = newOrder.type === 'MARKET' ? 'CANCELLED' : 'OPEN';
  } else if (newOrder.remainingQty > 0) {
    status = 'PARTIALLY_FILLED';
  } else {
    status = 'FILLED';
  }

  return {
    order_id: newOrder.orderId,
    status,
    filled_qty: filledQty,
    avg_fill_price: filledQty > 0 ? totalValue / filledQty : 0,
    message: `${filledQty} lembar tereksekusi dari ${newOrder.quantity}`,
  };
}

module.exports = { matchOrder };
