/**
 * BursaGRPC Client — Entry Point
 * Interactive CLI for trading on the virtual stock exchange.
 */

const readline = require('readline');
const chalk = require('chalk');
const { showMainMenu } = require('./menus/mainMenu');
const { showTradingMenu } = require('./menus/tradingMenu');
const { showAccountMenu } = require('./menus/accountMenu');
const { showMarketMenu } = require('./menus/marketMenu');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

// Session state
let session = null; // { traderId, traderName }

async function dashboardMenu() {
  console.log('');
  console.log(chalk.bold.cyan(`═══ Dashboard — ${session.traderName} ═══`));
  console.log('  1. 📊 Trading');
  console.log('  2. 📈 Market');
  console.log('  3. 💰 Account');
  console.log('  4. 🚪 Logout');
  console.log('  5. ❌ Exit');
  console.log('');

  const choice = await ask(chalk.yellow('Pilihan > '));

  switch (choice.trim()) {
    case '1':
      await showTradingMenu(rl, session);
      break;
    case '2':
      await showMarketMenu(rl, session);
      break;
    case '3':
      await showAccountMenu(rl, session);
      break;
    case '0':
    case '4':
      console.log(chalk.gray(`\n👋 Logout dari ${session.traderName}`));
      session = null;
      break;
    case '5':
      console.log(chalk.gray('\n👋 Sampai jumpa!\n'));
      rl.close();
      process.exit(0);
      break;
    default:
      console.log(chalk.red('Pilihan tidak valid. Tekan 0/4 untuk Logout, 5 untuk Exit.'));
  }
}

async function main() {
  console.clear();
  console.log(chalk.bold.cyan('\n  🏛️  BursaGRPC — Virtual Stock Exchange Simulator'));
  console.log(chalk.gray('  Paper trading platform berbasis gRPC\n'));

  while (true) {
    try {
      if (!session) {
        session = await showMainMenu(rl);
      } else {
        await dashboardMenu();
      }
    } catch (err) {
      if (err.message && err.message.includes('readline was closed')) {
        break;
      }
      console.error(chalk.red(`\n❌ Error: ${err.message}`));
    }
  }
}

// Handle graceful exit
process.on('SIGINT', () => {
  console.log(chalk.gray('\n\n👋 Sampai jumpa!\n'));
  rl.close();
  process.exit(0);
});

rl.on('close', () => {
  process.exit(0);
});

main();
