import { formatDateForDisplay, parseDateInput } from '../../src/settings';

describe('Date Formatting Utilities', () => {
  describe('formatDateForDisplay', () => {
    it('should format ISO dates correctly', () => {
      expect(formatDateForDisplay('2026-01-15', 'iso')).toBe('2026-01-15');
    });

    it('should format US dates correctly', () => {
      expect(formatDateForDisplay('2026-01-15', 'us')).toBe('01/15/2026');
    });

    it('should format UK dates correctly', () => {
      expect(formatDateForDisplay('2026-01-15', 'uk')).toBe('15/01/2026');
    });

    it('should handle undefined dates', () => {
      expect(formatDateForDisplay(undefined, 'iso')).toBe('Set date');
    });

    it('should handle ISO datetime strings', () => {
      expect(formatDateForDisplay('2026-01-15T10:30:00Z', 'us')).toBe('01/15/2026');
    });

    it('should handle invalid date strings', () => {
      expect(formatDateForDisplay('invalid', 'iso')).toBe('Set date');
    });
  });

  describe('parseDateInput', () => {
    it('should parse ISO format', () => {
      expect(parseDateInput('2026-01-15', 'iso')).toBe('2026-01-15');
    });

    it('should parse US format', () => {
      expect(parseDateInput('01/15/2026', 'us')).toBe('2026-01-15');
    });

    it('should parse UK format', () => {
      expect(parseDateInput('15/01/2026', 'uk')).toBe('2026-01-15');
    });

    it('should pad single digit months and days', () => {
      expect(parseDateInput('1/5/2026', 'us')).toBe('2026-01-05');
    });

    it('should handle 2-digit years', () => {
      expect(parseDateInput('01/15/26', 'us')).toBe('2026-01-15');
    });

    it('should return already formatted ISO dates', () => {
      expect(parseDateInput('2026-01-15', 'us')).toBe('2026-01-15');
    });

    it('should handle empty input', () => {
      expect(parseDateInput('', 'iso')).toBe('');
    });

    it('should handle invalid input', () => {
      expect(parseDateInput('invalid', 'iso')).toBe('');
    });
  });
});
