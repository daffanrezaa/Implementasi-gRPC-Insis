const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const { SERVER_ADDRESS } = require('../config');

const PROTO_OPTIONS = {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
};

const packageDef = protoLoader.loadSync(
  path.join(__dirname, '..', '..', 'proto', 'market.proto'),
  PROTO_OPTIONS
);
const proto = grpc.loadPackageDefinition(packageDef);

const marketStub = new proto.market.MarketService(
  SERVER_ADDRESS,
  grpc.credentials.createInsecure()
);

module.exports = { marketStub };
