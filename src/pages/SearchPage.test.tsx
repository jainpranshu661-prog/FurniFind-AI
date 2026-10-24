import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ShopProvider } from '../context/ShopContext';
import type { Product, SearchResult } from '../types';
import { SearchPage } from './SearchPage';

const { getCatalogFacets, searchProducts } = vi.hoisted(() => ({
  getCatalogFacets: vi.fn(),
  searchProducts: vi.fn(),
}));
vi.mock('../lib/catalog', () => ({ getCatalogFacets, searchProducts }));

const product: Product = {
  id: 'linea-desk',
  name: 'Linea Writing Desk',
  category: 'Office',
  price: 699,
  description: 'A compact oak desk.',
  material: 'Oak veneer, steel',
  color: 'Natural / black',
  dimensions: 'W 120 × D 60 × H 75 cm',
  image: 'https://example.com/desk.jpg',
  images: ['https://example.com/desk.jpg'],
  tags: ['compact'],
  featured: false,
  popular: false,
};

const result = (items: Product[] = [product], total = items.length, page = 1): SearchResult => ({
  items,
  total,
  page,
  page_size: 9,
});

function renderSearch(initialEntry = '/search') {
  return render(<MemoryRouter initialEntries={[initialEntry]}><ShopProvider><SearchPage /></ShopProvider></MemoryRouter>);
}

describe('SearchPage', () => {
  beforeEach(() => {
    localStorage.clear();
    getCatalogFacets.mockReset();
    searchProducts.mockReset();
    getCatalogFacets.mockResolvedValue({
      categories: ['Office'],
      materials: ['Oak veneer, steel'],
      colors: ['Natural / black'],
    });
    searchProducts.mockResolvedValue(result());
  });

  afterEach(cleanup);

  it('loads real catalog filter options and renders matching products', async () => {
    renderSearch('/search?category=Office');

    expect(await screen.findByText('Linea Writing Desk')).toBeInTheDocument();
    expect(getCatalogFacets).toHaveBeenCalledOnce();
    expect(document.querySelector('.filter-sidebar select') as HTMLSelectElement).toHaveValue('Office');
    expect(document.querySelector('.filter-sidebar')?.textContent).toContain('Oak veneer, steel');
    expect(screen.getByText('₹699')).toBeInTheDocument();
  });

  it('shows a clear empty result state', async () => {
    searchProducts.mockResolvedValue(result([], 0));
    renderSearch();

    expect(await screen.findByText('No pieces found this time.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear your filters' })).toBeInTheDocument();
  });

  it('shows an API error and recovers when retried', async () => {
    searchProducts.mockRejectedValueOnce(new Error('API unavailable')).mockResolvedValueOnce(result());
    renderSearch();

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't reach the catalog.");
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Linea Writing Desk')).toBeInTheDocument();
    expect(searchProducts).toHaveBeenCalledTimes(2);
  });

  it('rejects an inverted budget range without showing stale results as valid', async () => {
    const { container } = renderSearch();
    await screen.findByText('Linea Writing Desk');
    searchProducts.mockClear();

    fireEvent.change(container.querySelector('.filter-sidebar input[aria-label="Minimum price"]')!, { target: { value: '1000' } });
    fireEvent.change(container.querySelector('.filter-sidebar input[aria-label="Maximum price"]')!, { target: { value: '500' } });

    expect(container.querySelector('.search-results [role="alert"]')).toHaveTextContent('Minimum price must be less than or equal to maximum price.');
    await waitFor(() => expect(searchProducts).not.toHaveBeenCalledWith(
      expect.objectContaining({ min_price: '1000', max_price: '500' }),
    ));
  });

  it('requests the next API page when pagination is used', async () => {
    searchProducts.mockResolvedValue(result([product], 10));
    renderSearch();
    await screen.findByText('Linea Writing Desk');
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));

    await waitFor(() => expect(searchProducts).toHaveBeenCalledWith(expect.objectContaining({ page: 2 })));
  });
});
