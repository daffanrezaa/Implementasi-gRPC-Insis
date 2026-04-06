// server/state/serviceStore.js
// Stores all government service definitions.
// Read-only after seed — only AdminService.SetServiceStatus mutates is_open.

'use strict';

// Map<service_id, ServiceDefinition>
const services = new Map();

module.exports = {
  get:    (id)       => services.get(id),
  set:    (id, svc)  => services.set(id, svc),
  getAll: ()         => Array.from(services.values()),
  has:    (id)       => services.has(id),
};
