import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShopProvider } from '../context/ShopContext';
import type { Product } from '../types';
import { HomePage } from './HomePage';

const { searchProducts } = vi.hoisted(() => ({ searchProducts: vi.fn() }));
vi.mock('../lib/catalog', () => ({ searchProducts }));

const catalogProducts: Product[] = Array.from({ length: 12 }, (_, index) => ({
  id: index === 0 ? 'firestore-chair' : `catalog-product-${index}`,
  name: index === 0 ? 'Firestore Oak Chair' : `Catalog Product ${index}`,
  category: 'Living room',
  price: 123456 + index,
  description: 'A product loaded from the active product catalog.',
  material: 'Oak',
  color: 'Natural',
  image: 'https://example.com/chair.jpg',
  images: ['https://example.com/chair.jpg'],
  tags: ['chair'],
  featured: false,
  popular: false,
}));

function renderHome() {
  return render(<MemoryRouter><ShopProvider><HomePage /></ShopProvider></MemoryRouter>);
}

describe('HomePage catalog', () => {
  beforeEach(() => {
    searchProducts.mockReset();
    localStorage.clear();
  });

  it('loads and displays products from the paginated API response', async () => {
    searchProducts.mockResolvedValue({ items: catalogProducts, total: 12, page: 1, page_size: 12 });

    renderHome();

    expect(await screen.findByText('Firestore Oak Chair')).toBeInTheDocument();
    expect(screen.getByText('₹1,23,456')).toBeInTheDocument();
    expect(searchProducts).toHaveBeenCalledWith({ page_size: 12 });
    expect(screen.getAllByRole('article')).toHaveLength(12);
    expect(screen.getByRole('link', { name: 'Firestore Oak Chair' })).toHaveAttribute('href', '/product/firestore-chair');
  });

  it('shows a retryable error instead of substituting demo products', async () => {
    searchProducts.mockRejectedValue(new Error('API unavailable'));

    renderHome();

    expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t reach the product catalog.');
    expect(screen.queryByText('Arc Lounge Chair')).not.toBeInTheDocument();
  });
});
