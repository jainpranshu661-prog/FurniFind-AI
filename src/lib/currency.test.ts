import { describe, expect, it } from 'vitest';
import { formatCurrency } from './currency';

describe('formatCurrency', () => {
  it('formats prices in Indian rupees with Indian digit grouping', () => {
    expect(formatCurrency(123456)).toBe('₹1,23,456');
  });
});
