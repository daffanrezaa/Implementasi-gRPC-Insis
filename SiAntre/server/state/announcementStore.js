// server/state/announcementStore.js
// Stores announcements with unique IDs for deduplication.

'use strict';

const { v4: uuidv4 } = require('uuid');

const announcements = [];

module.exports = {
  add: (message, service_id = null) => {
    announcements.push({
      id: uuidv4(),
      message,
      service_id: service_id || '',
      timestamp: new Date().toISOString(),
    });
    // Keep only last 10 messages
    if (announcements.length > 10) announcements.shift();
  },
  getAll: () => [...announcements],
};
