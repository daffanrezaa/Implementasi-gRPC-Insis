// server/helpers/utils.js
// Shared utilities: date formatting, booking code generation, time calculation.

'use strict';

const AVG_SERVICE_MINUTES = 10; // configurable average minutes per person

// Return today's date as "YYYY-MM-DD"
function todayStr() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

// Format a Date as "HH:MM"
function timeStr(date) {
  return date.toTimeString().slice(0, 5);
}

// Check if a YYYY-MM-DD date string is today or in the future
function isValidFutureDate(dateStr) {
  return dateStr >= todayStr();
}

// Generate a short, human-readable booking code: e.g. "PKB-A3F7"
function generateBookingCode(shortCode) {
  const hex = Math.floor(Math.random() * 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
  return `${shortCode}-${hex}`;
}

// Build a shared slot_id from date and time (NO service_id — slots are shared)
function buildSlotId(date, time) {
  // "2026-04-07_0900"
  return `${date}_${time.replace(':', '')}`;
}

// Estimated wait string based on number of people ahead
function estimatedWait(peopleAhead) {
  if (peopleAhead <= 0) return '± 0 menit (giliran segera)';
  return `± ${peopleAhead * AVG_SERVICE_MINUTES} menit`;
}

// Generate 30-minute slot times between openHour and closeHour strings ("08:00")
// Returns array of "HH:MM" strings
function generateTimeSlots(openHour, closeHour) {
  const slots = [];
  const [oh, om] = openHour.split(':').map(Number);
  const [ch, cm] = closeHour.split(':').map(Number);
  const openMins  = oh * 60 + om;
  const closeMins = ch * 60 + cm;

  for (let m = openMins; m < closeMins; m += 30) {
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    slots.push(`${hh}:${mm}`);
  }
  return slots;
}

// Check if NIP belongs to a registered officer
function isOfficer(nip) {
  const { officerStore } = require('../state');
  return officerStore.isRegistered((nip || '').toUpperCase());
}

// Check if a booking is within the check-in window (max 15 min before session)
// Returns true if check-in is still allowed, false if deadline has passed
function isWithinCheckinDeadline(slotDate, slotTime) {
  const now = new Date();
  const [hh, mm] = slotTime.split(':').map(Number);
  const sessionStart = new Date(`${slotDate}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00`);
  const deadline = new Date(sessionStart.getTime() - 15 * 60 * 1000); // 15 min before
  return now <= deadline;
}

// Check if a booking session has already expired (past 15-min check-in deadline)
function isExpired(slotDate, slotTime) {
  return !isWithinCheckinDeadline(slotDate, slotTime);
}

module.exports = {
  todayStr,
  timeStr,
  isValidFutureDate,
  generateBookingCode,
  buildSlotId,
  estimatedWait,
  generateTimeSlots,
  isOfficer,
  isWithinCheckinDeadline,
  isExpired,
  AVG_SERVICE_MINUTES,
};
