/**
 * Account Menu — Balance, Trade History, Performance
 */

const chalk = require('chalk');
const { accountStub } = require('../stubs/accountStub');
const { formatRupiah, colorPnl, renderTradeHistory } = require('../utils/display');

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function showAccountMenu(rl, session) {
  console.log('');
  console.log(chalk.bold.magenta('═══ Account Menu ═══'));
  console.log('  1. Cek Saldo & Equity');
  console.log('  2. Riwayat Transaksi');
  console.log('  3. Performance Analytics');
  console.log('  0. Kembali');
  console.log('');

  const choice = await ask(rl, chalk.yellow('Pilihan > '));

  switch (choice.trim()) {
    case '1':
      await getBalance(session.traderId);
      break;
    case '2':
      await getTradeHistory(session.traderId);
      break;
    case '3':
      await getPerformance(session.traderId);
      break;
    case '0':
      return;
    default:
      console.log(chalk.red('Pilihan tidak valid.'));
  }
}

function getBalance(traderId) {
  return new Promise((resolve) => {
    accountStub.GetBalance({ trader_id: traderId }, (err, res) => {
      if (err) {
        console.log(chalk.red(`❌ ${err.details || err.message}`));
        return resolve();
      }
      console.log('');
      console.log(chalk.bold('💰 Informasi Saldo'));
      console.log(`   Cash:            ${formatRupiah(res.cash_balance)}`);
      console.log(`   Portfolio Value:  ${formatRupiah(res.portfolio_value)}`);
      console.log(chalk.bold(`   Total Equity:    ${formatRupiah(res.total_equity)}`));
      resolve();
    });
  });
}

function getTradeHistory(traderId) {
  return new Promise((resolve) => {
    accountStub.GetTradeHistory(
      { trader_id: traderId, limit: 20, offset: 0 },
      (err, res) => {
        if (err) {
          console.log(chalk.red(`❌ ${err.details || err.message}`));
          return resolve();
        }
        if (res.trades.length === 0) {
          console.log(chalk.gray('\nBelum ada riwayat transaksi.'));
          return resolve();
        }
        console.log(chalk.bold(`\n📜 Riwayat Transaksi (${res.total_count} total)\n`));
        renderTradeHistory(res.trades);
        resolve();
      }
    );
  });
}

function getPerformance(traderId) {
  return new Promise((resolve) => {
    accountStub.GetPerformance({ trader_id: traderId }, (err, res) => {
      if (err) {
        console.log(chalk.red(`❌ ${err.details || err.message}`));
        return resolve();
      }
      console.log('');
      console.log(chalk.bold('📊 Performance Analytics'));
      console.log(`   Return Rate:     ${colorPnl(res.return_rate_pct, Math.abs(res.return_rate_pct).toFixed(2) + '%')}`);
      console.log(`   Win Rate:        ${res.win_rate_pct.toFixed(1)}%`);
      console.log(`   Total Trades:    ${res.total_trades}`);
      console.log(`   Best Trade P&L:  ${colorPnl(res.best_trade_pnl, formatRupiah(Math.abs(res.best_trade_pnl)))}`);
      console.log(`   Worst Trade P&L: ${colorPnl(res.worst_trade_pnl, formatRupiah(Math.abs(res.worst_trade_pnl)))}`);
      resolve();
    });
  });
}

module.exports = { showAccountMenu };
