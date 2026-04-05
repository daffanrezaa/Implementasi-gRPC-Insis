/**
 * Portfolio & Equity Management
 * Handles holding updates with weighted average cost and realized P&L tracking.
 */

const { BOT_ID } = require('../config');

function updatePortfolio(traderId, side, qty, price, ticker, state) {
  if (traderId === BOT_ID) return; // Bot has infinite liquidity, no portfolio tracking

  const trader = state.users.get(traderId);
  const portfolio = state.portfolios.get(traderId);
  let pnl = 0;

  if (side === 'BUY') {
    trader.cash -= qty * price;
    const holding = portfolio.get(ticker) || { qty: 0, avgCost: 0 };
    const totalQty = holding.qty + qty;
    const totalCost = holding.qty * holding.avgCost + qty * price;
    portfolio.set(ticker, { qty: totalQty, avgCost: totalCost / totalQty });
  } else {
    // SELL — calculate realized P&L before updating
    const holding = portfolio.get(ticker);
    pnl = (price - holding.avgCost) * qty;
    trader.cash += qty * price;
    holding.qty -= qty;
    if (holding.qty === 0) {
      portfolio.delete(ticker);
    } else {
      portfolio.set(ticker, holding);
    }
  }

  state.tradeHistory.get(traderId).push({
    ticker,
    side,
    qty,
    price,
    timestamp: Date.now(),
    pnl,
  });
}

function getEquity(traderId, state) {
  const trader = state.users.get(traderId);
  if (!trader) return { cashBalance: 0, portfolioValue: 0, totalEquity: 0 };

  const portfolio = state.portfolios.get(traderId);
  let portfolioValue = 0;

  if (portfolio) {
    for (const [ticker, holding] of portfolio.entries()) {
      const priceData = state.prices.get(ticker);
      if (priceData) {
        portfolioValue += holding.qty * priceData.current;
      }
    }
  }

  return {
    cashBalance: trader.cash,
    portfolioValue,
    totalEquity: trader.cash + portfolioValue,
  };
}

module.exports = { updatePortfolio, getEquity };
