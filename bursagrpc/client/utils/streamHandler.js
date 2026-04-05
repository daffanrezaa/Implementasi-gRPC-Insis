/**
 * Stream Handler Utilities
 * Helpers for managing streaming gRPC calls from client side.
 */

const chalk = require('chalk');

function handleStreamError(err, streamName) {
  if (err.code === 1) {
    // CANCELLED — user stopped the stream
    console.log(chalk.yellow(`\n⏹  ${streamName} stream stopped.`));
  } else {
    console.error(chalk.red(`\n❌ ${streamName} error: ${err.message}`));
  }
}

function createPromptToStop(rl, call, streamName) {
  return new Promise((resolve) => {
    rl.question(chalk.gray('\n  Tekan Enter untuk berhenti...\n'), () => {
      call.cancel();
      resolve();
    });
  });
}

module.exports = { handleStreamError, createPromptToStop };
