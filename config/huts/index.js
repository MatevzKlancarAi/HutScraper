/**
 * Hut Registry
 * Central registry for all supported mountain huts
 */

const triglavskiDom = require('./triglavski-dom');

// Registry of all supported huts
const huts = {
  'triglavski-dom': triglavskiDom
};

/**
 * Get all registered huts
 */
function getAllHuts() {
  return Object.values(huts);
}

/**
 * Get hut by ID
 */
function getHutById(hutId) {
  return huts[hutId] || null;
}

/**
 * Get hut by name (case-insensitive)
 */
function getHutByName(name) {
  return Object.values(huts).find(
    hut => hut.name.toLowerCase() === name.toLowerCase()
  ) || null;
}

/**
 * Get all hut IDs
 */
function getHutIds() {
  return Object.keys(huts);
}

/**
 * Register a new hut
 */
function registerHut(hutId, hutConfig) {
  if (!hutId || !hutConfig) {
    throw new Error('Hut ID and configuration are required');
  }
  
  if (huts[hutId]) {
    throw new Error(`Hut with ID '${hutId}' is already registered`);
  }
  
  huts[hutId] = hutConfig;
}

/**
 * Get huts by booking system
 */
function getHutsByBookingSystem(system) {
  return Object.values(huts).filter(
    hut => hut.bookingSystem.toLowerCase() === system.toLowerCase()
  );
}

module.exports = {
  huts,
  getAllHuts,
  getHutById,
  getHutByName,
  getHutIds,
  registerHut,
  getHutsByBookingSystem
};