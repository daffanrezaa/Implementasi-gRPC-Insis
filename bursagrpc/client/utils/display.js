/**
 * Display Utilities
 * Formatters for Rupiah currency, portfolio tables, order book, leaderboard.
 */

const chalk = require('chalk');
const Table = require('cli-table3');

function formatRupiah(amount) {
  return 'Rp ' + Math.round(amount).toLocaleString('id-ID');
}

function colorPnl(value, formatted) {
  if (value > 0) return chalk.green('+' + formatted);
  if (value < 0) return chalk.red(formatted);
  return chalk.gray(formatted);
}

function colorChange(pct) {
  const s = pct.toFixed(2) + '%';
  if (pct > 0) return chalk.green('▲ +' + s);
  if (pct < 0) return chalk.red('▼ ' + s);
  return chalk.gray('  ' + s);
}

function renderPortfolioTable(holdings, totalValue, totalPnl) {
  const table = new Table({
    head: [
      chalk.bold('Ticker'),
      chalk.bold('Qty'),
      chalk.bold('Avg Cost'),
      chalk.bold('Harga Sekarang'),
      chalk.bold('P&L (Rp)'),
      chalk.bold('P&L (%)'),
    ],
    colAligns: ['left', 'right', 'right', 'right', 'right', 'right'],
  });

  for (const h of holdings) {
    table.push([
      chalk.bold.cyan(h.ticker),
      h.quantity.toLocaleString('id-ID'),
      formatRupiah(h.avg_cost),
      formatRupiah(h.current_price),
      colorPnl(h.pnl_amount, formatRupiah(Math.abs(h.pnl_amount))),
      colorPnl(h.pnl_pct, Math.abs(h.pnl_pct).toFixed(2) + '%'),
    ]);
  }

  console.log(table.toString());
  console.log(chalk.bold(`\nTotal Nilai Portfolio: ${formatRupiah(totalValue)}`));
  console.log(chalk.bold(`Unrealized P&L:       ${colorPnl(totalPnl, formatRupiah(Math.abs(totalPnl)))}`));
}

function renderOrderBook(data) {
  console.log(chalk.bold.cyan(`\n📊 Order Book: ${data.ticker}`));
  console.log(chalk.gray(`   Spread: ${formatRupiah(data.spread)}\n`));

  const table = new Table({
    head: [
      chalk.green.bold('BID Qty'),
      chalk.green.bold('BID Price'),
      chalk.red.bold('ASK Price'),
      chalk.red.bold('ASK Qty'),
    ],
    colAligns: ['right', 'right', 'right', 'right'],
  });

  const maxLen = Math.max(data.bids.length, data.asks.length);
  for (let i = 0; i < maxLen; i++) {
    const bid = data.bids[i];
    const ask = data.asks[i];
    table.push([
      bid ? chalk.green(bid.quantity.toLocaleString('id-ID')) : '',
      bid ? chalk.green(formatRupiah(bid.price)) : '',
      ask ? chalk.red(formatRupiah(ask.price)) : '',
      ask ? chalk.red(ask.quantity.toLocaleString('id-ID')) : '',
    ]);
  }

  console.log(table.toString());
}

function renderLeaderboard(entries) {
  const table = new Table({
    head: [
      chalk.bold('#'),
      chalk.bold('Trader'),
      chalk.bold('Total Equity'),
      chalk.bold('Return'),
      chalk.bold('Trades'),
    ],
    colAligns: ['center', 'left', 'right', 'right', 'right'],
  });

  const medals = ['🥇', '🥈', '🥉'];
  for (const e of entries) {
    table.push([
      medals[e.rank - 1] || e.rank,
      chalk.bold(e.trader_name),
      formatRupiah(e.total_equity),
      colorPnl(e.return_pct, Math.abs(e.return_pct).toFixed(2) + '%'),
      e.total_trades,
    ]);
  }

  console.log(table.toString());
}

function renderMarketUpdate(update) {
  const change = colorChange(update.change_pct);
  const spread = update.ask - update.bid;
  console.log(
    chalk.bold.cyan(update.ticker.padEnd(6)) +
    chalk.white(formatRupiah(update.price).padStart(14)) + '  ' +
    change.padEnd(20) +
    chalk.gray(` Bid: ${formatRupiah(update.bid)} | Ask: ${formatRupiah(update.ask)} | Vol: ${Number(update.volume).toLocaleString('id-ID')}`)
  );
}

function renderTradeHistory(trades) {
  const table = new Table({
    head: [
      chalk.bold('#'),
      chalk.bold('Ticker'),
      chalk.bold('Side'),
      chalk.bold('Qty'),
      chalk.bold('Price'),
      chalk.bold('P&L'),
      chalk.bold('Waktu'),
    ],
    colAligns: ['right', 'left', 'center', 'right', 'right', 'right', 'left'],
  });

  trades.forEach((t, i) => {
    const sideColor = t.side === 'BUY' ? chalk.green : chalk.red;
    const time = new Date(Number(t.timestamp)).toLocaleString('id-ID');
    table.push([
      i + 1,
      chalk.bold.cyan(t.ticker),
      sideColor(t.side),
      t.quantity.toLocaleString('id-ID'),
      formatRupiah(t.price),
      t.pnl ? colorPnl(t.pnl, formatRupiah(Math.abs(t.pnl))) : chalk.gray('-'),
      chalk.gray(time),
    ]);
  });

  console.log(table.toString());
}

module.exports = {
  formatRupiah,
  colorPnl,
  colorChange,
  renderPortfolioTable,
  renderOrderBook,
  renderLeaderboard,
  renderMarketUpdate,
  renderTradeHistory,
};
