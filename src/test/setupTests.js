import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Vitest loads this file before each test file.
// It is a shared place for small browser/test helpers that many tests need.

// React Testing Library renders components into a fake DOM during tests.
// Cleaning up after each test removes the previous render so tests do not
// accidentally affect each other.
afterEach(() => {
  cleanup();
});

// JSDOM is a lightweight browser-like environment, but it does not implement
// every browser API. Some UI libraries expect `matchMedia` to exist, so we add
// a simple fallback that behaves like "no media query is currently matched".
if (!window.matchMedia) {
  window.matchMedia = () => ({
    matches: false,
    media: '',
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// Some components animate or schedule visual work with `requestAnimationFrame`.
// In real browsers this runs on the next paint frame; in tests we simulate it
// with a short timeout so animation-based code can still run.
if (!window.requestAnimationFrame) {
  window.requestAnimationFrame = (callback) => {
    return window.setTimeout(() => {
      callback(window.performance.now());
    }, 16);
  };
}

// This is the matching cleanup function for the fallback above.
// If a test cancels an animation frame, we cancel the timeout that we created.
if (!window.cancelAnimationFrame) {
  window.cancelAnimationFrame = (handle) => {
    window.clearTimeout(handle);
  };
}
