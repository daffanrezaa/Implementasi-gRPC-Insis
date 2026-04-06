// server/helpers/broadcast.js
// Broadcast a QueueUpdate to all subscribers of a service.
// Personalizes each update: your_number, people_ahead, estimated_wait, event_type.

'use strict';

const queueStore   = require('../state/queueStore');
const { estimatedWait } = require('./utils');

/**
 * Count how many people are ahead of `myNumber` in the waiting list.
 * Returns 0 if myNumber is not in the list (e.g. observer without queue number).
 */
function countPeopleAhead(waitingList, myNumber) {
  if (!myNumber || myNumber === 0) return 0;
  const idx = waitingList.indexOf(myNumber);
  return idx === -1 ? 0 : idx;
}

/**
 * Broadcast a message to all active subscribers of a service.
 * Handles dead subscribers (failed writes) by collecting and removing them.
 *
 * @param {string} service_id
 * @param {object} baseUpdate — QueueUpdate fields (without personalized fields)
 * @returns {number} number of subscribers successfully notified
 */
function broadcast(service_id, baseUpdate) {
  const queue = queueStore.get(service_id);
  if (!queue || queue.subscribers.length === 0) return 0;

  const dead = [];
  let sent = 0;

  for (const sub of queue.subscribers) {
    const peopleAhead = countPeopleAhead(queue.waiting_list, sub.my_queue_number);

    // Upgrade QUEUE_MOVED to YOUR_TURN for the specific subscriber
    const isYourTurn = (
      baseUpdate.event_type === 'QUEUE_MOVED' &&
      sub.my_queue_number > 0 &&
      sub.my_queue_number === queue.current_number
    );

    const update = {
      ...baseUpdate,
      your_number:   sub.my_queue_number,
      people_ahead:  peopleAhead,
      estimated_wait: estimatedWait(peopleAhead),
      event_type:    isYourTurn ? 'YOUR_TURN' : baseUpdate.event_type,
      message:       isYourTurn
        ? `🔔 Giliran Anda! Nomor ${sub.my_queue_number} — Segera menuju loket.`
        : (baseUpdate.message || ''),
      timestamp:     new Date().toISOString(),
    };

    try {
      sub.call.write(update);
      sent++;
    } catch {
      dead.push(sub.citizen_id);
    }
  }

  // Clean up dead subscribers
  if (dead.length > 0) {
    queue.subscribers = queue.subscribers.filter(s => !dead.includes(s.citizen_id));
    console.log(`[Broadcast] Cleaned ${dead.length} dead subscriber(s) from ${service_id}`);
  }

  return sent;
}

/**
 * Broadcast to ALL services (used for system-wide announcements or quota resets).
 */
function broadcastAll(baseUpdate) {
  let total = 0;
  for (const queue of queueStore.getAll()) {
    total += broadcast(queue.service_id, { ...baseUpdate, service_id: queue.service_id });
  }
  return total;
}

module.exports = { broadcast, broadcastAll, countPeopleAhead };
