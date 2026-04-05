/**
 * Market Menu — WatchMarket, WatchLeaderboard, GetStockInfo, StreamTrade
 */

const chalk = require('chalk');
const { marketStub } = require('../stubs/marketStub');
const { formatRupiah, colorChange, renderLeaderboard, renderMarketUpdate } = require('../utils/display');
const { handleStreamError, createPromptToStop } = require('../utils/streamHandler');

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function showMarketMenu(rl, session) {
  console.log('');
  console.log(chalk.bold.green('═══ Market Menu ═══'));
  console.log('  1. Get Stock Info');
  console.log('  2. Watch Market (Server Streaming)');
  console.log('  3. Watch Leaderboard (Server Streaming)');
  console.log('  4. Stream Trade (Bidi Streaming)');
  console.log('  0. Kembali');
  console.log('');

  const choice = await ask(rl, chalk.yellow('Pilihan > '));

  switch (choice.trim()) {
    case '1':
      await getStockInfo(rl);
      break;
    case '2':
      await watchMarket(rl);
      break;
    case '3':
      await watchLeaderboard(rl);
      break;
    case '4':
      await streamTrade(rl, session);
      break;
    case '0':
      return;
    default:
      console.log(chalk.red('Pilihan tidak valid.'));
  }
}

async function getStockInfo(rl) {
  const ticker = (await ask(rl, chalk.white('Ticker (kosong = semua): '))).toUpperCase().trim();

  if (!ticker) {
    // Show all stocks
    const tickers = ['BBCA', 'TLKM', 'GOTO', 'ASII', 'BMRI'];
    console.log(chalk.bold('\n📈 Market Overview\n'));

    let completed = 0;
    await new Promise((resolve) => {
      for (const t of tickers) {
        marketStub.GetStockInfo({ ticker: t }, (err, res) => {
          if (err) {
            console.log(chalk.red(`  ${t}: ${err.details || err.message}`));
          } else {
            const change = colorChange(res.change_pct);
            console.log(
              `  ${chalk.bold.cyan(res.ticker.padEnd(6))} ` +
              `${formatRupiah(res.price).padStart(14)}  ${change}  ` +
              chalk.gray(`O:${formatRupiah(res.open)} H:${formatRupiah(res.high)} L:${formatRupiah(res.low)} V:${Number(res.volume).toLocaleString('id-ID')}`)
            );
          }
          completed++;
          if (completed === tickers.length) resolve();
        });
      }
    });
    return;
  }

  return new Promise((resolve) => {
    marketStub.GetStockInfo({ ticker }, (err, res) => {
      if (err) {
        console.log(chalk.red(`\n❌ ${err.details || err.message}`));
        return resolve();
      }
      console.log('');
      console.log(chalk.bold.cyan(`📈 ${res.ticker}`));
      console.log(`   Harga:   ${formatRupiah(res.price)}  ${colorChange(res.change_pct)}`);
      console.log(`   Open:    ${formatRupiah(res.open)}`);
      console.log(`   High:    ${chalk.green(formatRupiah(res.high))}`);
      console.log(`   Low:     ${chalk.red(formatRupiah(res.low))}`);
      console.log(`   Volume:  ${Number(res.volume).toLocaleString('id-ID')}`);
      console.log(`   Bid:     ${formatRupiah(res.bid)}`);
      console.log(`   Ask:     ${formatRupiah(res.ask)}`);
      resolve();
    });
  });
}

async function watchMarket(rl) {
  const tickerInput = (await ask(rl, chalk.white('Ticker filter (kosong = semua): '))).trim();
  const tickers = tickerInput ? tickerInput.toUpperCase().split(/[,\s]+/).filter(Boolean) : [];

  const call = marketStub.WatchMarket({ tickers });

  console.log(chalk.bold.cyan('\n📡 Live Market Feed'));
  console.log(chalk.gray('─'.repeat(80)));

  call.on('data', (update) => {
    renderMarketUpdate(update);
  });

  call.on('error', (err) => handleStreamError(err, 'WatchMarket'));
  call.on('end', () => console.log(chalk.gray('\nStream ended by server.')));

  await createPromptToStop(rl, call, 'WatchMarket');
}

async function watchLeaderboard(rl) {
  const call = marketStub.WatchLeaderboard({ top_n: 10 });

  console.log(chalk.bold.yellow('\n🏆 Live Leaderboard'));

  call.on('data', (update) => {
    // Clear some lines for refresh effect
    console.log(chalk.gray(`\n─── Update: ${new Date(Number(update.timestamp)).toLocaleTimeString('id-ID')} ───`));
    if (update.entries.length === 0) {
      console.log(chalk.gray('  Belum ada trader yang terdaftar.'));
    } else {
      renderLeaderboard(update.entries);
    }
  });

  call.on('error', (err) => handleStreamError(err, 'WatchLeaderboard'));
  call.on('end', () => console.log(chalk.gray('\nStream ended by server.')));

  await createPromptToStop(rl, call, 'WatchLeaderboard');
}

async function streamTrade(rl, session) {
  const call = marketStub.StreamTrade();

  console.log(chalk.bold.magenta('\n🔄 Live Trading Session (Bi-directional Streaming)'));
  console.log(chalk.gray('Commands:'));
  console.log(chalk.gray('  order BUY/SELL TICKER QTY PRICE [LIMIT/MARKET]'));
  console.log(chalk.gray('  cancel ORDER_ID'));
  console.log(chalk.gray('  ping'));
  console.log(chalk.gray('  exit\n'));

  call.on('data', (event) => {
    const ts = new Date(Number(event.timestamp)).toLocaleTimeString('id-ID');
    switch (event.event_type) {
      case 'PONG':
        console.log(chalk.gray(`  [${ts}] 🏓 PONG`));
        break;
      case 'ORDER_FILLED':
        console.log(chalk.green(`  [${ts}] ✅ FILLED: ${event.message} @ ${formatRupiah(event.fill_price)} (${event.fill_qty} lembar)`));
        break;
      case 'ORDER_PARTIAL':
        console.log(chalk.yellow(`  [${ts}] ⚡ PARTIAL: ${event.message} @ ${formatRupiah(event.fill_price)} (${event.fill_qty} lembar)`));
        break;
      case 'ORDER_CONFIRMED':
        console.log(chalk.cyan(`  [${ts}] 📝 OPEN: ${event.message}`));
        break;
      case 'ORDER_CANCELLED':
        console.log(chalk.yellow(`  [${ts}] ❌ CANCELLED: ${event.message}`));
        break;
      case 'ERROR':
        console.log(chalk.red(`  [${ts}] ⚠️  ERROR: ${event.message}`));
        break;
      default:
        console.log(chalk.gray(`  [${ts}] ${event.event_type}: ${event.message}`));
    }
  });

  call.on('error', (err) => {
    if (err.code !== 1) { // not CANCELLED
      console.error(chalk.red(`\n❌ StreamTrade error: ${err.message}`));
    }
  });

  call.on('end', () => {
    console.log(chalk.gray('\nSession ended by server.'));
  });

  // Interactive loop
  while (true) {
    const input = (await ask(rl, chalk.magenta('trade> '))).trim();
    if (!input) continue;

    if (input.toLowerCase() === 'exit') {
      call.end();
      console.log(chalk.gray('Session closed.'));
      await new Promise((r) => setTimeout(r, 300));
      break;
    }

    if (input.toLowerCase() === 'ping') {
      call.write({ action_type: 'PING' });
      continue;
    }

    if (input.toLowerCase().startsWith('cancel ')) {
      const orderId = input.substring(7).trim();
      call.write({ action_type: 'CANCEL_ORDER', order_id: orderId });
      continue;
    }

    if (input.toLowerCase().startsWith('order ')) {
      const parts = input.substring(6).trim().split(/\s+/);
      if (parts.length < 4) {
        console.log(chalk.red('Format: order SIDE TICKER QTY PRICE [TYPE]'));
        continue;
      }
      const [side, ticker, qty, price, type] = parts;
      call.write({
        action_type: 'PLACE_ORDER',
        order: {
          trader_id: session.traderId,
          ticker: ticker.toUpperCase(),
          side: side.toUpperCase(),
          quantity: parseInt(qty, 10),
          price: parseFloat(price),
          type: (type || 'LIMIT').toUpperCase(),
        },
      });
      continue;
    }

    console.log(chalk.red('Command tidak dikenali. Gunakan: order, cancel, ping, exit'));
  }
}

module.exports = { showMarketMenu };
