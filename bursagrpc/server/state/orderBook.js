/**
 * Order Book Management
 * Maintains sorted bids (DESC price) and asks (ASC price) with FIFO for same price.
 */

function insertToOrderBook(order, state) {
  const side = order.side === 'BUY' ? 'bids' : 'asks';
  const book = state.orderBook[order.ticker][side];

  book.push(order);

  if (order.side === 'BUY') {
    // Bids: highest price first, earliest order first if same price
    book.sort((a, b) => b.price - a.price || a.createdAt - b.createdAt);
  } else {
    // Asks: lowest price first, earliest order first if same price
    book.sort((a, b) => a.price - b.price || a.createdAt - b.createdAt);
  }
}

function removeOrder(orderId, ticker, state) {
  const book = state.orderBook[ticker];
  for (const side of ['bids', 'asks']) {
    const idx = book[side].findIndex((o) => o.orderId === orderId);
    if (idx !== -1) {
      return book[side].splice(idx, 1)[0];
    }
  }
  return null;
}

function getAggregatedBook(ticker, depth, state) {
  const book = state.orderBook[ticker];
  const d = depth || 5;

  const aggregateLevels = (orders) => {
    const levels = {};
    for (const order of orders) {
      const key = order.price;
      if (!levels[key]) {
        levels[key] = { price: order.price, quantity: 0, order_count: 0 };
      }
      levels[key].quantity += order.remainingQty;
      levels[key].order_count++;
    }
    return Object.values(levels);
  };

  const bids = aggregateLevels(book.bids)
    .sort((a, b) => b.price - a.price)
    .slice(0, d);

  const asks = aggregateLevels(book.asks)
    .sort((a, b) => a.price - b.price)
    .slice(0, d);

  const spread = (asks[0]?.price ?? 0) - (bids[0]?.price ?? 0);

  return { bids, asks, spread, ticker };
}

module.exports = { insertToOrderBook, removeOrder, getAggregatedBook };
