import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, beforeEach } from 'vitest';
import { ShopProvider, useShop } from './ShopContext';

function Controls() {
  const { wishlist, comparison, darkMode, toggleWishlist, toggleCompare, toggleDarkMode } = useShop();
  return <><button onClick={() => toggleWishlist('arc-lounge-chair')}>Save</button><button onClick={() => toggleCompare('arc-lounge-chair')}>Compare</button><button onClick={toggleDarkMode}>Toggle theme</button><output>{wishlist.join(',')}</output><output>{comparison.join(',')}</output><output>{darkMode ? 'dark' : 'light'}</output></>;
}

describe('ShopProvider', () => {
  afterEach(cleanup);

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('persists wishlist and comparison selections', () => {
    render(<ShopProvider><Controls /></ShopProvider>);
    fireEvent.click(screen.getByText('Save'));
    fireEvent.click(screen.getByText('Compare'));
    expect(screen.getAllByText('arc-lounge-chair')).toHaveLength(2);
    expect(JSON.parse(localStorage.getItem('furnifind-wishlist') ?? '[]')).toEqual(['arc-lounge-chair']);
    expect(JSON.parse(localStorage.getItem('furnifind-compare') ?? '[]')).toEqual(['arc-lounge-chair']);
  });

  it('applies and persists the selected color theme', () => {
    render(<ShopProvider><Controls /></ShopProvider>);
    fireEvent.click(screen.getByText('Toggle theme'));
    expect(screen.getByText('dark')).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('furnifind-theme')).toBe('dark');
  });
});
