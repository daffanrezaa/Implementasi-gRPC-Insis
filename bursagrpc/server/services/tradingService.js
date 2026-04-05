/**
 * TradingService Handlers
 * PlaceOrder, CancelOrder, GetPortfolio, GetOrderBook, BatchPlaceOrders
 */

const grpc = require('@grpc/grpc-js');
const crypto = require('crypto');
const { state } = require('../state/store');
const { matchOrder } = require('../engine/matcher');
const { removeOrder, getAggregatedBook } = require('../state/orderBook');
const { getEquity } = require('../state/portfolio');

function buildOrder(req) {
  const side = typeof req.side === 'string' ? req.side : (req.side === 1 ? 'SELL' : 'BUY');
  const type = typeof req.type === 'string' ? req.type : (req.type === 1 ? 'MARKET' : 'LIMIT');
  return {
    orderId: crypto.randomUUID(),
    traderId: req.trader_id,
    ticker: req.ticker ? req.ticker.toUpperCase() : '',
    side,
    type,
    quantity: req.quantity,
    price: req.price,
    remainingQty: req.quantity,
    createdAt: Date.now(),
  };
}

function validateOrder(req, state) {
  const side = typeof req.side === 'string' ? req.side : (req.side === 1 ? 'SELL' : 'BUY');
  const type = typeof req.type === 'string' ? req.type : (req.type === 1 ? 'MARKET' : 'LIMIT');
  const ticker = req.ticker ? req.ticker.toUpperCase() : '';

  if (!state.users.has(req.trader_id)) {
    return { code: grpc.status.UNAUTHENTICATED, message: 'Trader belum terdaftar. Silakan Register terlebih dahulu.' };
  }
  if (!state.orderBook[ticker]) {
    return { code: grpc.status.NOT_FOUND, message: `Ticker '${ticker}' tidak ditemukan. Pilih: BBCA, TLKM, GOTO, ASII, BMRI.` };
  }
  if (req.quantity <= 0) {
    return { code: grpc.status.INVALID_ARGUMENT, message: 'Quantity harus lebih dari 0.' };
  }
  if (type === 'LIMIT' && req.price <= 0) {
    return { code: grpc.status.INVALID_ARGUMENT, message: 'Harga LIMIT order harus lebih dari 0.' };
  }

  const trader = state.users.get(req.trader_id);

  if (side === 'BUY') {
    let estimatedCost;
    if (type === 'MARKET') {
      const bestAsk = state.orderBook[ticker].asks[0]?.price;
      if (!bestAsk) {
        return { code: grpc.status.FAILED_PRECONDITION, message: 'Tidak ada order jual di market. Gunakan LIMIT order.' };
      }
      estimatedCost = bestAsk * req.quantity;
    } else {
      estimatedCost = req.price * req.quantity;
    }
    if (trader.cash < estimatedCost) {
      return {
        code: grpc.status.FAILED_PRECONDITION,
        message: `Saldo tidak cukup. Dibutuhkan: Rp ${estimatedCost.toLocaleString('id-ID')}, Tersedia: Rp ${trader.cash.toLocaleString('id-ID')}`,
      };
    }
  }

  if (side === 'SELL') {
    const portfolio = state.portfolios.get(req.trader_id);
    const holding = portfolio ? portfolio.get(ticker) : null;
    if (!holding || holding.qty < req.quantity) {
      return {
        code: grpc.status.FAILED_PRECONDITION,
        message: `Saham tidak cukup. Dibutuhkan: ${req.quantity}, Dimiliki: ${holding?.qty ?? 0}`,
      };
    }
  }

  return null; // valid
}

const tradingHandlers = {
  PlaceOrder(call, callback) {
    const req = call.request;
    const error = validateOrder(req, state);
    if (error) return callback(error);

    try {
      const newOrder = buildOrder(req);
      state.orders.set(newOrder.orderId, { ...newOrder, status: 'PENDING' });

      const result = matchOrder(newOrder, state);
      state.orders.get(newOrder.orderId).status = result.status;
      state.orders.get(newOrder.orderId).remainingQty = newOrder.remainingQty;

      const trader = state.users.get(req.trader_id);
      console.log(`📊 PlaceOrder: ${trader.name} ${newOrder.side} ${newOrder.ticker} ${req.quantity}@${req.price || 'MARKET'} → ${result.status}`);

      // Send fill notification to bidi session if active
      const session = state.bidiSessions.get(req.trader_id);
      if (session && result.filled_qty > 0) {
        try {
          session.write({
            event_type: result.status === 'FILLED' ? 'ORDER_FILLED' : 'ORDER_PARTIAL',
            order_id: result.order_id,
            fill_price: result.avg_fill_price,
            fill_qty: result.filled_qty,
            message: result.message,
            timestamp: Date.now(),
          });
        } catch { /* session may be dead */ }
      }

      callback(null, result);
    } catch (err) {
      console.error('PlaceOrder internal error:', err);
      callback({ code: grpc.status.INTERNAL, message: 'Terjadi kesalahan internal server.' });
    }
  },

  CancelOrder(call, callback) {
    const { trader_id, order_id } = call.request;

    if (!state.users.has(trader_id)) {
      return callback({ code: grpc.status.UNAUTHENTICATED, message: 'Trader belum terdaftar.' });
    }

    const order = state.orders.get(order_id);
    if (!order) {
      return callback({ code: grpc.status.NOT_FOUND, message: `Order '${order_id}' tidak ditemukan.` });
    }
    if (order.traderId !== trader_id) {
      return callback({ code: grpc.status.PERMISSION_DENIED, message: 'Anda tidak bisa membatalkan order milik trader lain.' });
    }
    if (order.status !== 'OPEN' && order.status !== 'PARTIALLY_FILLED') {
      return callback({
        code: grpc.status.FAILED_PRECONDITION,
        message: `Order sudah ${order.status}, tidak bisa dibatalkan.`,
      });
    }

    // Remove from order book
    removeOrder(order_id, order.ticker, state);

    // Refund for remaining BUY quantity
    let refunded_amount = 0;
    if (order.side === 'BUY') {
      refunded_amount = order.remainingQty * order.price;
      const trader = state.users.get(trader_id);
      trader.cash += refunded_amount;
    }

    order.status = 'CANCELLED';

    const trader = state.users.get(trader_id);
    console.log(`❌ CancelOrder: ${trader.name} cancelled ${order_id} (${order.ticker} ${order.side}), refund: Rp ${refunded_amount.toLocaleString('id-ID')}`);

    callback(null, {
      success: true,
      refunded_amount,
      message: `Order dibatalkan.${refunded_amount > 0 ? ` Refund: Rp ${refunded_amount.toLocaleString('id-ID')}` : ''}`,
    });
  },

  GetPortfolio(call, callback) {
    const { trader_id } = call.request;

    if (!state.users.has(trader_id)) {
      return callback({ code: grpc.status.NOT_FOUND, message: 'Trader tidak ditemukan.' });
    }

    const portfolio = state.portfolios.get(trader_id);
    const { cashBalance, portfolioValue, totalEquity } = getEquity(trader_id, state);
    const holdings = [];
    let totalPnl = 0;

    if (portfolio) {
      for (const [ticker, holding] of portfolio.entries()) {
        const currentPrice = state.prices.get(ticker)?.current ?? 0;
        const pnlAmount = (currentPrice - holding.avgCost) * holding.qty;
        const pnlPct = holding.avgCost > 0 ? ((currentPrice - holding.avgCost) / holding.avgCost) * 100 : 0;
        totalPnl += pnlAmount;

        holdings.push({
          ticker,
          quantity: holding.qty,
          avg_cost: holding.avgCost,
          current_price: currentPrice,
          pnl_pct: pnlPct,
          pnl_amount: pnlAmount,
        });
      }
    }

    callback(null, {
      holdings,
      total_value: totalEquity,
      total_pnl: totalPnl,
    });
  },

  GetOrderBook(call, callback) {
    const { ticker, depth } = call.request;
    const t = ticker ? ticker.toUpperCase() : '';

    if (!state.orderBook[t]) {
      return callback({ code: grpc.status.NOT_FOUND, message: `Ticker '${t}' tidak ditemukan.` });
    }

    const result = getAggregatedBook(t, depth, state);
    callback(null, result);
  },

  // Client-side Streaming
  BatchPlaceOrders(call, callback) {
    const summary = { total: 0, filled: 0, open: 0, rejected: 0, total_value_executed: 0 };

    call.on('data', (req) => {
      summary.total++;
      const error = validateOrder(req, state);
      if (error) {
        summary.rejected++;
        return;
      }

      try {
        const newOrder = buildOrder(req);
        state.orders.set(newOrder.orderId, { ...newOrder, status: 'PENDING' });
        const result = matchOrder(newOrder, state);
        state.orders.get(newOrder.orderId).status = result.status;

        if (result.status === 'FILLED' || result.status === 'PARTIALLY_FILLED') {
          summary.filled++;
          summary.total_value_executed += result.filled_qty * result.avg_fill_price;
        } else if (result.status === 'OPEN') {
          summary.open++;
        } else {
          summary.rejected++;
        }
      } catch {
        summary.rejected++;
      }
    });

    call.on('end', () => {
      console.log(`📦 BatchPlaceOrders: ${summary.total} orders → ${summary.filled} filled, ${summary.open} open, ${summary.rejected} rejected`);
      callback(null, summary);
    });

    call.on('error', (err) => {
      console.error('BatchPlaceOrders stream error:', err.message);
    });
  },
};

module.exports = { tradingHandlers };
