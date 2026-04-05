/**
 * MarketService Handlers
 * GetStockInfo, WatchMarket, WatchLeaderboard, StreamTrade
 */

const grpc = require('@grpc/grpc-js');
const crypto = require('crypto');
const { state } = require('../state/store');
const { changePct } = require('../engine/priceEngine');
const { broadcastMarketUpdate, broadcastLeaderboard } = require('../engine/broadcaster');
const { matchOrder } = require('../engine/matcher');
const { removeOrder } = require('../state/orderBook');

const marketHandlers = {
  GetStockInfo(call, callback) {
    const ticker = call.request.ticker ? call.request.ticker.toUpperCase() : '';
    const p = state.prices.get(ticker);

    if (!p) {
      return callback({
        code: grpc.status.NOT_FOUND,
        message: `Ticker '${ticker}' tidak ditemukan. Pilih: BBCA, TLKM, GOTO, ASII, BMRI.`,
      });
    }

    const book = state.orderBook[ticker];
    callback(null, {
      ticker,
      price: p.current,
      open: p.open,
      high: p.high,
      low: p.low,
      volume: p.volume,
      change_pct: changePct(ticker, state),
      bid: book.bids[0]?.price ?? 0,
      ask: book.asks[0]?.price ?? 0,
    });
  },

  // Server-side Streaming
  WatchMarket(call) {
    const tickers = (call.request.tickers || []).map((t) => t.toUpperCase());
    call._bursaWatchTickers = tickers; // stored for broadcaster filtering
    state.marketSubscribers.add(call);

    const targets = tickers.length > 0 ? tickers : [...state.prices.keys()];
    console.log(`📡 WatchMarket subscriber added (tickers: ${targets.join(', ')}). Total: ${state.marketSubscribers.size}`);

    // Send initial snapshot
    for (const ticker of targets) {
      const p = state.prices.get(ticker);
      if (!p) continue;
      const book = state.orderBook[ticker];
      call.write({
        ticker,
        price: p.current,
        bid: book.bids[0]?.price ?? p.current,
        ask: book.asks[0]?.price ?? p.current,
        volume: p.volume,
        change_pct: changePct(ticker, state),
        high: p.high,
        low: p.low,
        timestamp: Date.now(),
      });
    }

    call.on('cancelled', () => {
      state.marketSubscribers.delete(call);
      console.log(`📡 WatchMarket subscriber disconnected. Total: ${state.marketSubscribers.size}`);
    });

    call.on('error', () => {
      state.marketSubscribers.delete(call);
    });
  },

  // Server-side Streaming
  WatchLeaderboard(call) {
    state.leaderboardSubscribers.add(call);
    console.log(`🏆 WatchLeaderboard subscriber added. Total: ${state.leaderboardSubscribers.size}`);

    // Send immediate leaderboard snapshot
    broadcastLeaderboard(state);

    call.on('cancelled', () => {
      state.leaderboardSubscribers.delete(call);
      console.log(`🏆 WatchLeaderboard subscriber disconnected. Total: ${state.leaderboardSubscribers.size}`);
    });

    call.on('error', () => {
      state.leaderboardSubscribers.delete(call);
    });
  },

  // Bi-directional Streaming
  StreamTrade(call) {
    let traderId = null;
    let traderName = 'unknown';
    console.log('🔄 StreamTrade session started');

    call.on('data', (action) => {
      const type = action.action_type;

      if (type === 'PING') {
        call.write({
          event_type: 'PONG',
          message: 'pong',
          timestamp: Date.now(),
        });
        return;
      }

      if (type === 'PLACE_ORDER') {
        const orderInfo = action.order;
        if (!orderInfo || !orderInfo.trader_id) {
          call.write({
            event_type: 'ERROR',
            message: 'trader_id diperlukan dalam order.',
            timestamp: Date.now(),
          });
          return;
        }

        // Register session on first order
        if (!traderId) {
          traderId = orderInfo.trader_id;
          const user = state.users.get(traderId);
          traderName = user ? user.name : 'unknown';
          state.bidiSessions.set(traderId, call);
          console.log(`🔄 StreamTrade session linked to trader: ${traderName}`);
        }

        if (!state.users.has(orderInfo.trader_id)) {
          call.write({
            event_type: 'ERROR',
            message: 'Trader belum terdaftar.',
            timestamp: Date.now(),
          });
          return;
        }

        const ticker = orderInfo.ticker ? orderInfo.ticker.toUpperCase() : '';
        if (!state.orderBook[ticker]) {
          call.write({
            event_type: 'ERROR',
            message: `Ticker '${ticker}' tidak ditemukan.`,
            timestamp: Date.now(),
          });
          return;
        }

        const side = (orderInfo.side || 'BUY').toUpperCase();
        const type = (orderInfo.type || 'LIMIT').toUpperCase();
        const quantity = orderInfo.quantity || 0;
        const price = orderInfo.price || 0;

        if (quantity <= 0) {
          call.write({ event_type: 'ERROR', message: 'Quantity harus > 0.', timestamp: Date.now() });
          return;
        }
        if (type === 'LIMIT' && price <= 0) {
          call.write({ event_type: 'ERROR', message: 'Harga LIMIT harus > 0.', timestamp: Date.now() });
          return;
        }

        try {
          const orderId = crypto.randomUUID();
          const newOrder = {
            orderId,
            traderId: orderInfo.trader_id,
            ticker,
            side,
            type,
            quantity,
            price,
            remainingQty: quantity,
            createdAt: Date.now(),
          };
          state.orders.set(orderId, { ...newOrder, status: 'PENDING' });

          const result = matchOrder(newOrder, state);
          state.orders.get(orderId).status = result.status;

          let eventType;
          if (result.status === 'FILLED') eventType = 'ORDER_FILLED';
          else if (result.status === 'PARTIALLY_FILLED') eventType = 'ORDER_PARTIAL';
          else eventType = 'ORDER_CONFIRMED';

          call.write({
            event_type: eventType,
            order_id: result.order_id,
            fill_price: result.avg_fill_price,
            fill_qty: result.filled_qty,
            message: `${side} ${ticker} ${quantity}@${price || 'MKT'} → ${result.status} (${result.filled_qty} filled)`,
            timestamp: Date.now(),
          });

          console.log(`🔄 StreamTrade [${traderName}]: ${side} ${ticker} ${quantity}@${price || 'MKT'} → ${result.status}`);
        } catch (err) {
          call.write({
            event_type: 'ERROR',
            message: 'Matching engine error: ' + err.message,
            timestamp: Date.now(),
          });
        }
        return;
      }

      if (type === 'CANCEL_ORDER') {
        const orderId = action.order_id;
        if (!orderId) {
          call.write({ event_type: 'ERROR', message: 'order_id diperlukan.', timestamp: Date.now() });
          return;
        }

        const order = state.orders.get(orderId);
        if (!order) {
          call.write({ event_type: 'ERROR', message: `Order '${orderId}' tidak ditemukan.`, timestamp: Date.now() });
          return;
        }
        if (traderId && order.traderId !== traderId) {
          call.write({ event_type: 'ERROR', message: 'Bukan order milik Anda.', timestamp: Date.now() });
          return;
        }

        removeOrder(orderId, order.ticker, state);
        if (order.side === 'BUY') {
          const trader = state.users.get(order.traderId);
          if (trader) trader.cash += order.remainingQty * order.price;
        }
        order.status = 'CANCELLED';

        call.write({
          event_type: 'ORDER_CANCELLED',
          order_id: orderId,
          message: `Order ${orderId} dibatalkan.`,
          timestamp: Date.now(),
        });
        return;
      }

      // Unknown action
      call.write({
        event_type: 'ERROR',
        message: `Action '${type}' tidak dikenali. Gunakan: PLACE_ORDER, CANCEL_ORDER, PING.`,
        timestamp: Date.now(),
      });
    });

    call.on('end', () => {
      if (traderId) state.bidiSessions.delete(traderId);
      console.log(`🔄 StreamTrade session ended: ${traderName}`);
      call.end();
    });

    call.on('cancelled', () => {
      if (traderId) state.bidiSessions.delete(traderId);
      console.log(`🔄 StreamTrade session cancelled: ${traderName}`);
    });

    call.on('error', (err) => {
      if (traderId) state.bidiSessions.delete(traderId);
      if (err.code !== grpc.status.CANCELLED) {
        console.error(`🔄 StreamTrade error [${traderName}]:`, err.message);
      }
    });
  },
};

module.exports = { marketHandlers };
