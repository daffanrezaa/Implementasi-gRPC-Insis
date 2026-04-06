// server/state/queueStore.js
// Stores active queue state per service.
// The subscribers array holds live gRPC stream handles.
//
// QueueState shape:
// {
//   service_id:        string,
//   current_number:    number,   // number currently being served (0 = not started)
//   next_queue_number: number,   // counter; incremented on each ConfirmArrival
//   waiting_list:      number[], // queue numbers in order of arrival [3,5,7,...]
//   quota_remaining:   number,
//   subscribers:       Subscriber[],
// }
//
// Subscriber shape:
// { citizen_id: string, my_queue_number: number, call: ServerWritableStream }

'use strict';

// Map<service_id, QueueState>
const queues = new Map();

module.exports = {
  get:    (id)          => queues.get(id),
  set:    (id, state)   => queues.set(id, state),
  has:    (id)          => queues.has(id),
  getAll: ()            => Array.from(queues.values()),

  // Total active subscribers across all services
  totalSubscribers() {
    let n = 0;
    for (const q of queues.values()) n += q.subscribers.length;
    return n;
  },
};
