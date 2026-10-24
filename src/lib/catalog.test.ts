import { describe, expect, it } from 'vitest';
import { filterCatalog, localSearch } from './catalog';
import { products } from '../data/products';

describe('localSearch', () => {
  it('matches natural phrases against product details and tags', () => {
    const results = localSearch('a compact desk for working from home');
    expect(results[0]?.id).toBe('linea-desk');
    expect(results[0]?.match_reason).toContain('catalog details');
  });

  it('returns the catalog for a query containing only common words', () => {
    expect(localSearch('find me some furniture')).toHaveLength(products.length);
  });

  it('does not claim a match when no catalog detail matches', () => {
    expect(localSearch('blue leather recliner')).toHaveLength(0);
  });
});

describe('filterCatalog', () => {
  it('combines category, maximum price, and ascending price sort', () => {
    const results = filterCatalog(products, { category: 'Living room', maxPrice: 500, sort: 'price-asc' });
    expect(results.map((product) => product.id)).toEqual(['woven-storage-bench', 'arc-lounge-chair']);
  });
});
