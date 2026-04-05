/**
 * BursaGRPC Server — Entry Point
 * Binds AccountService, TradingService, MarketService to a single gRPC server.
 * Starts Market Maker bot and periodic Leaderboard broadcasts.
 */

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const { state } = require('./state/store');
const { accountHandlers } = require('./services/accountService');
const { tradingHandlers } = require('./services/tradingService');
const { marketHandlers } = require('./services/marketService');
const { startMarketMaker } = require('./bot/marketMaker');
const { broadcastLeaderboard } = require('./engine/broadcaster');
const { PORT, LEADERBOARD_INTERVAL_MS } = require('./config');

const PROTO_OPTIONS = {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
};

const PROTO_DIR = path.join(__dirname, '..', 'proto');

// Load proto definitions
const accountDef = protoLoader.loadSync(path.join(PROTO_DIR, 'account.proto'), PROTO_OPTIONS);
const tradingDef = protoLoader.loadSync(path.join(PROTO_DIR, 'trading.proto'), PROTO_OPTIONS);
const marketDef = protoLoader.loadSync(path.join(PROTO_DIR, 'market.proto'), PROTO_OPTIONS);

const accountProto = grpc.loadPackageDefinition(accountDef);
const tradingProto = grpc.loadPackageDefinition(tradingDef);
const marketProto = grpc.loadPackageDefinition(marketDef);

// Create server and add services
const server = new grpc.Server();
server.addService(accountProto.account.AccountService.service, accountHandlers);
server.addService(tradingProto.trading.TradingService.service, tradingHandlers);
server.addService(marketProto.market.MarketService.service, marketHandlers);

// Start server
server.bindAsync(
  `0.0.0.0:${PORT}`,
  grpc.ServerCredentials.createInsecure(),
  (err, port) => {
    if (err) {
      console.error('❌ Failed to start server:', err);
      process.exit(1);
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════');
    console.log('  🏛️  BursaGRPC — Virtual Stock Exchange Server');
    console.log('═══════════════════════════════════════════════════');
    console.log(`  Port:     ${port}`);
    console.log(`  Services: AccountService, TradingService, MarketService`);
    console.log('');

    // Print seed prices
    console.log('📈 Market Prices (Seed):');
    for (const [ticker, data] of state.prices) {
      console.log(`   ${ticker.padEnd(6)} Rp ${data.current.toLocaleString('id-ID').padStart(8)}  (${data.name})`);
    }
    console.log('');

    // Start market maker bot
    startMarketMaker(state);

    // Start periodic leaderboard broadcast
    setInterval(() => broadcastLeaderboard(state), LEADERBOARD_INTERVAL_MS);

    console.log('✅ Server ready. Waiting for connections...\n');
  }
);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  server.tryShutdown(() => {
    console.log('Server stopped.');
    process.exit(0);
  });
});
