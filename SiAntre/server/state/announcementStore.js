'use strict';

const announcements = [];

module.exports = {
  add: (message) => {
    announcements.push({
      message,
      timestamp: new Date().toISOString()
    });
    // Keep only last 10 messages
    if (announcements.length > 10) announcements.shift();
  },
  getAll: () => [...announcements],
};
