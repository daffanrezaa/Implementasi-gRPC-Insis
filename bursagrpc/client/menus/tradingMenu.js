/**
 * Trading Menu — PlaceOrder, CancelOrder, GetPortfolio, GetOrderBook, BatchPlaceOrders
 */

const chalk = require('chalk');
const { tradingStub } = require('../stubs/tradingStub');
const { formatRupiah, renderPortfolioTable, renderOrderBook } = require('../utils/display');

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function showTradingMenu(rl, session) {
  console.log('');
  console.log(chalk.bold.yellow('═══ Trading Menu ═══'));
  console.log('  1. Place Order');
  console.log('  2. Cancel Order');
  console.log('  3. View Portfolio');
  console.log('  4. View Order Book');
  console.log('  5. Batch Place Orders (Client Streaming)');
  console.log('  0. Kembali');
  console.log('');

  const choice = await ask(rl, chalk.yellow('Pilihan > '));

  switch (choice.trim()) {
    case '1':
      await placeOrder(rl, session);
      break;
    case '2':
      await cancelOrder(rl, session);
      break;
    case '3':
      await getPortfolio(session.traderId);
      break;
    case '4':
      await getOrderBook(rl);
      break;
    case '5':
      await batchPlaceOrders(rl, session);
      break;
    case '0':
      return;
    default:
      console.log(chalk.red('Pilihan tidak valid.'));
  }
}

async function placeOrder(rl, session) {
  console.log(chalk.gray('\nTicker: BBCA | TLKM | GOTO | ASII | BMRI'));
  const ticker = (await ask(rl, chalk.white('Ticker: '))).toUpperCase().trim();
  if (!['BBCA', 'TLKM', 'GOTO', 'ASII', 'BMRI'].includes(ticker)) {
    console.log(chalk.red('Ticker tidak valid.'));
    return;
  }

  const sideInput = (await ask(rl, chalk.white('Side (BUY/SELL): '))).toUpperCase().trim();
  if (!['BUY', 'SELL'].includes(sideInput)) {
    console.log(chalk.red('Side harus BUY atau SELL.'));
    return;
  }

  const typeInput = (await ask(rl, chalk.white('Type (LIMIT/MARKET): '))).toUpperCase().trim();
  if (!['LIMIT', 'MARKET'].includes(typeInput)) {
    console.log(chalk.red('Type harus LIMIT atau MARKET.'));
    return;
  }

  const quantity = parseInt(await ask(rl, chalk.white('Quantity (lembar): ')), 10);
  if (isNaN(quantity) || quantity <= 0) {
    console.log(chalk.red('Quantity harus angka > 0.'));
    return;
  }

  let price = 0;
  if (typeInput === 'LIMIT') {
    price = parseFloat(await ask(rl, chalk.white('Harga per lembar: ')));
    if (isNaN(price) || price <= 0) {
      console.log(chalk.red('Harga harus angka > 0.'));
      return;
    }
  }

  return new Promise((resolve) => {
    tradingStub.PlaceOrder(
      {
        trader_id: session.traderId,
        ticker,
        side: sideInput,
        type: typeInput,
        quantity,
        price,
      },
      (err, res) => {
        if (err) {
          console.log(chalk.red(`\n❌ ${err.details || err.message}`));
          return resolve();
        }
        const statusColor = res.status === 'FILLED' ? chalk.green : res.status === 'CANCELLED' ? chalk.red : chalk.yellow;
        console.log('');
        console.log(chalk.bold('📝 Order Result'));
        console.log(`   Order ID: ${chalk.gray(res.order_id)}`);
        console.log(`   Status:   ${statusColor(res.status)}`);
        console.log(`   Filled:   ${res.filled_qty} lembar`);
        if (res.avg_fill_price > 0) {
          console.log(`   Avg Price: ${formatRupiah(res.avg_fill_price)}`);
        }
        console.log(`   ${chalk.gray(res.message)}`);
        resolve();
      }
    );
  });
}

async function cancelOrder(rl, session) {
  const orderId = (await ask(rl, chalk.white('Order ID: '))).trim();
  if (!orderId) {
    console.log(chalk.red('Order ID tidak boleh kosong.'));
    return;
  }

  return new Promise((resolve) => {
    tradingStub.CancelOrder(
      { trader_id: session.traderId, order_id: orderId },
      (err, res) => {
        if (err) {
          console.log(chalk.red(`\n❌ ${err.details || err.message}`));
          return resolve();
        }
        console.log(chalk.green(`\n✅ ${res.message}`));
        resolve();
      }
    );
  });
}

function getPortfolio(traderId) {
  return new Promise((resolve) => {
    tradingStub.GetPortfolio({ trader_id: traderId }, (err, res) => {
      if (err) {
        console.log(chalk.red(`❌ ${err.details || err.message}`));
        return resolve();
      }
      if (res.holdings.length === 0) {
        console.log(chalk.gray('\nBelum memiliki saham.'));
        return resolve();
      }
      console.log(chalk.bold('\n📁 Portfolio\n'));
      renderPortfolioTable(res.holdings, res.total_value, res.total_pnl);
      resolve();
    });
  });
}

async function getOrderBook(rl) {
  const ticker = (await ask(rl, chalk.white('Ticker: '))).toUpperCase().trim();

  return new Promise((resolve) => {
    tradingStub.GetOrderBook({ ticker, depth: 10 }, (err, res) => {
      if (err) {
        console.log(chalk.red(`❌ ${err.details || err.message}`));
        return resolve();
      }
      renderOrderBook(res);
      resolve();
    });
  });
}

async function batchPlaceOrders(rl, session) {
  console.log(chalk.bold('\n📦 Batch Place Orders (Client-side Streaming)'));
  console.log(chalk.gray('Masukkan order satu per satu. Ketik "done" untuk submit.\n'));

  const call = tradingStub.BatchPlaceOrders((err, response) => {
    if (err) {
      console.log(chalk.red(`\n❌ Batch error: ${err.details || err.message}`));
      return;
    }
    console.log('');
    console.log(chalk.bold('📦 Batch Result'));
    console.log(`   Total:    ${response.total}`);
    console.log(`   Filled:   ${chalk.green(response.filled)}`);
    console.log(`   Open:     ${chalk.yellow(response.open)}`);
    console.log(`   Rejected: ${chalk.red(response.rejected)}`);
    if (response.total_value_executed > 0) {
      console.log(`   Value:    ${formatRupiah(response.total_value_executed)}`);
    }
  });

  let count = 0;
  while (true) {
    const input = (await ask(rl, chalk.gray(`Order #${count + 1} `) + chalk.white('(e.g. BUY BBCA 100 9300 LIMIT) atau "done": '))).trim();

    if (input.toLowerCase() === 'done') {
      call.end();
      console.log(chalk.gray(`\nMengirim ${count} orders untuk diproses...`));
      // Give time for callback to fire
      await new Promise((resolve) => setTimeout(resolve, 500));
      break;
    }

    const parts = input.split(/\s+/);
    if (parts.length < 4) {
      console.log(chalk.red('Format: SIDE TICKER QUANTITY PRICE [TYPE]. Contoh: BUY BBCA 100 9300 LIMIT'));
      continue;
    }

    const [side, ticker, qty, price, type] = parts;
    call.write({
      trader_id: session.traderId,
      ticker: ticker.toUpperCase(),
      side: side.toUpperCase(),
      quantity: parseInt(qty, 10),
      price: parseFloat(price),
      type: (type || 'LIMIT').toUpperCase(),
    });
    count++;
    console.log(chalk.gray(`   ✓ Order #${count} queued: ${side.toUpperCase()} ${ticker.toUpperCase()} ${qty}@${price}`));
  }
}

module.exports = { showTradingMenu };
