// Jest setup file
// Add custom matchers, global test utilities, etc.

import '@testing-library/jest-dom';

// Polyfill crypto.randomUUID for test environment
// JSDOM doesn't provide crypto.randomUUID, so we add it
if (typeof crypto === 'undefined' || !crypto.randomUUID) {
  const cryptoPolyfill = {
    randomUUID: () => {
      // Simple UUID v4 implementation
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }
  };
  
  if (typeof crypto === 'undefined') {
    (globalThis as any).crypto = cryptoPolyfill;
  } else {
    (crypto as any).randomUUID = cryptoPolyfill.randomUUID;
  }
}

// Extend Jest matchers if needed
// expect.extend({
//   // Custom matchers can go here
// });
