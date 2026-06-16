'use strict';

const listeners = new Set();

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(thread) {
  for (const listener of listeners) {
    try {
      listener(thread);
    } catch (err) {
      console.error('Support live update listener failed:', err);
    }
  }
}

module.exports = {
  publish,
  subscribe,
};
