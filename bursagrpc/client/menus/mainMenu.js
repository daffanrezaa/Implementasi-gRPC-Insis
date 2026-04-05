/**
 * Main Menu — Register / Login
 */

const chalk = require('chalk');
const { accountStub } = require('../stubs/accountStub');
const { formatRupiah } = require('../utils/display');

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function showMainMenu(rl) {
  console.log('');
  console.log(chalk.bold.cyan('═══════════════════════════════════════════'));
  console.log(chalk.bold.cyan('  🏛️  BursaGRPC — Virtual Stock Exchange'));
  console.log(chalk.bold.cyan('═══════════════════════════════════════════'));
  console.log('');
  console.log('  1. Register (Daftar Baru)');
  console.log('  2. Login (Masuk)');
  console.log('  3. Exit');
  console.log('');

  const choice = await ask(rl, chalk.yellow('Pilihan > '));

  switch (choice.trim()) {
    case '1':
      return await handleRegister(rl);
    case '2':
      return await handleLogin(rl);
    case '3':
      console.log(chalk.gray('\n👋 Sampai jumpa!\n'));
      process.exit(0);
    default:
      console.log(chalk.red('Pilihan tidak valid.'));
      return null;
  }
}

function handleRegister(rl) {
  return new Promise(async (resolve) => {
    const name = await ask(rl, chalk.white('Masukkan nama trader: '));
    if (!name.trim()) {
      console.log(chalk.red('Nama tidak boleh kosong.'));
      return resolve(null);
    }

    accountStub.Register(
      { name: name.trim(), starting_balance: 0 },
      (err, response) => {
        if (err) {
          console.log(chalk.red(`\n❌ ${err.details || err.message}`));
          return resolve(null);
        }
        console.log(chalk.green(`\n✅ ${response.message}`));
        console.log(chalk.gray(`   Trader ID: ${response.trader_id}`));
        resolve({ traderId: response.trader_id, traderName: name.trim() });
      }
    );
  });
}

function handleLogin(rl) {
  return new Promise(async (resolve) => {
    const name = await ask(rl, chalk.white('Masukkan nama trader: '));
    if (!name.trim()) {
      console.log(chalk.red('Nama tidak boleh kosong.'));
      return resolve(null);
    }

    accountStub.GetLogin({ name: name.trim() }, (err, response) => {
      if (err) {
        console.log(chalk.red(`\n❌ ${err.details || err.message}`));
        return resolve(null);
      }
      if (!response.found) {
        console.log(chalk.red(`\n❌ Trader '${name}' tidak ditemukan. Silakan Register terlebih dahulu.`));
        return resolve(null);
      }
      console.log(chalk.green(`\n✅ Login berhasil! Equity: ${formatRupiah(response.balance)}`));
      resolve({ traderId: response.trader_id, traderName: name.trim() });
    });
  });
}

module.exports = { showMainMenu };
