/**
 * AccountService Handlers
 * Register, GetLogin, GetBalance, GetTradeHistory, GetPerformance
 */

const grpc = require('@grpc/grpc-js');
const crypto = require('crypto');
const { state } = require('../state/store');
const { getEquity } = require('../state/portfolio');
const { STARTING_BALANCE } = require('../config');

const accountHandlers = {
  Register(call, callback) {
    const { name, starting_balance } = call.request;

    if (!name || name.trim() === '') {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: 'Nama tidak boleh kosong.',
      });
    }

    // Check unique name
    for (const [, user] of state.users) {
      if (user.name.toLowerCase() === name.trim().toLowerCase()) {
        return callback({
          code: grpc.status.ALREADY_EXISTS,
          message: `Nama '${name}' sudah dipakai. Silakan gunakan nama lain.`,
        });
      }
    }

    const trader_id = crypto.randomUUID();
    const balance = starting_balance > 0 ? starting_balance : STARTING_BALANCE;

    state.users.set(trader_id, {
      name: name.trim(),
      cash: balance,
      createdAt: Date.now(),
    });
    state.portfolios.set(trader_id, new Map());
    state.tradeHistory.set(trader_id, []);

    console.log(`📝 Trader registered: ${name} (${trader_id}), balance: Rp ${balance.toLocaleString('id-ID')}`);

    callback(null, {
      trader_id,
      balance,
      message: `Selamat datang, ${name}! Saldo awal: Rp ${balance.toLocaleString('id-ID')}`,
    });
  },

  GetLogin(call, callback) {
    const { name } = call.request;

    for (const [id, user] of state.users) {
      if (user.name.toLowerCase() === name.trim().toLowerCase()) {
        const { totalEquity } = getEquity(id, state);
        console.log(`🔑 Trader login: ${user.name} (${id})`);
        return callback(null, { trader_id: id, balance: totalEquity, found: true });
      }
    }

    callback(null, { trader_id: '', balance: 0, found: false });
  },

  GetBalance(call, callback) {
    const { trader_id } = call.request;

    if (!state.users.has(trader_id)) {
      return callback({
        code: grpc.status.NOT_FOUND,
        message: 'Trader tidak ditemukan.',
      });
    }

    const { cashBalance, portfolioValue, totalEquity } = getEquity(trader_id, state);
    callback(null, {
      cash_balance: cashBalance,
      portfolio_value: portfolioValue,
      total_equity: totalEquity,
    });
  },

  GetTradeHistory(call, callback) {
    const { trader_id, limit, offset } = call.request;

    if (!state.users.has(trader_id)) {
      return callback({
        code: grpc.status.NOT_FOUND,
        message: 'Trader tidak ditemukan.',
      });
    }

    const history = state.tradeHistory.get(trader_id) || [];
    const total_count = history.length;
    const lim = limit > 0 ? limit : 20;
    const off = offset > 0 ? offset : 0;

    // Newest first
    const sorted = [...history].reverse();
    const sliced = sorted.slice(off, off + lim);

    const trades = sliced.map((t) => ({
      ticker: t.ticker,
      side: t.side,
      quantity: t.qty,
      price: t.price,
      timestamp: t.timestamp,
      pnl: t.pnl || 0,
    }));

    callback(null, { trades, total_count });
  },

  GetPerformance(call, callback) {
    const { trader_id } = call.request;

    if (!state.users.has(trader_id)) {
      return callback({
        code: grpc.status.NOT_FOUND,
        message: 'Trader tidak ditemukan.',
      });
    }

    const history = state.tradeHistory.get(trader_id) || [];
    const { totalEquity } = getEquity(trader_id, state);

    const total_trades = history.length;
    const return_rate_pct =
      ((totalEquity - STARTING_BALANCE) / STARTING_BALANCE) * 100;

    // Win rate based on SELL trades with positive P&L
    const sells = history.filter((t) => t.side === 'SELL');
    const wins = sells.filter((t) => t.pnl > 0);
    const win_rate_pct = sells.length > 0 ? (wins.length / sells.length) * 100 : 0;

    // Best and worst trade P&L
    const pnls = sells.map((t) => t.pnl);
    const best_trade_pnl = pnls.length > 0 ? Math.max(...pnls) : 0;
    const worst_trade_pnl = pnls.length > 0 ? Math.min(...pnls) : 0;

    callback(null, {
      return_rate_pct,
      win_rate_pct,
      total_trades,
      best_trade_pnl,
      worst_trade_pnl,
    });
  },
};

module.exports = { accountHandlers };
