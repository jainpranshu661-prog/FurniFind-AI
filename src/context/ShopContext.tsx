import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type ShopState = {
  wishlist: string[];
  comparison: string[];
  darkMode: boolean;
  toggleWishlist: (id: string) => void;
  toggleCompare: (id: string) => void;
  removeCompare: (id: string) => void;
  toggleDarkMode: () => void;
};
const ShopContext = createContext<ShopState | null>(null);

function readIds(key: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function readDarkMode(): boolean {
  try {
    const preference = localStorage.getItem('furnifind-theme');
    if (preference === 'dark') return true;
    if (preference === 'light') return false;
  } catch {
    // Use the system preference when browser storage is unavailable.
  }
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
}

export function ShopProvider({ children }: { children: ReactNode }) {
  const [wishlist, setWishlist] = useState<string[]>(() => readIds('furnifind-wishlist'));
  const [comparison, setComparison] = useState<string[]>(() => readIds('furnifind-compare').slice(0, 3));
  const [darkMode, setDarkMode] = useState(readDarkMode);

  useEffect(() => { localStorage.setItem('furnifind-wishlist', JSON.stringify(wishlist)); }, [wishlist]);
  useEffect(() => { localStorage.setItem('furnifind-compare', JSON.stringify(comparison)); }, [comparison]);
  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
    localStorage.setItem('furnifind-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const toggleWishlist = (id: string) => setWishlist((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const toggleCompare = (id: string) => setComparison((current) => current.includes(id) ? current : current.length >= 3 ? current : [...current, id]);
  const removeCompare = (id: string) => setComparison((current) => current.filter((item) => item !== id));
  const toggleDarkMode = () => setDarkMode((current) => !current);

  return <ShopContext.Provider value={{ wishlist, comparison, darkMode, toggleWishlist, toggleCompare, removeCompare, toggleDarkMode }}>{children}</ShopContext.Provider>;
}

export function useShop() {
  const context = useContext(ShopContext);
  if (!context) throw new Error('useShop must be used within ShopProvider');
  return context;
}
