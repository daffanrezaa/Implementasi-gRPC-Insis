// server/state/index.js
// Single import point for all stores — ensures every service shares the same instances.

'use strict';

const serviceStore = require('./serviceStore');
const slotStore    = require('./slotStore');
const bookingStore = require('./bookingStore');
const queueStore   = require('./queueStore');
const citizenStore = require('./citizenStore');
const officerStore = require('./officerStore');
const announcementStore = require('./announcementStore');

module.exports = { serviceStore, slotStore, bookingStore, queueStore, citizenStore, officerStore, announcementStore };
