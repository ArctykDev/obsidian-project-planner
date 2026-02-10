import '@testing-library/jest-dom';

// Polyfill for test environment
// Add crypto.randomUUID
if (typeof crypto === 'undefined' || !crypto.randomUUID) {
  const cryptoPolyfill = {
    randomUUID: () => {
      // UUID v4 implementation
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
