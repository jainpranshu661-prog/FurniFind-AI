import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { AssistantWidget } from './components/AssistantWidget';
import { ShopProvider } from './context/ShopContext';
import { ComparePage } from './pages/ComparePage';
import { HomePage } from './pages/HomePage';
import { ProductPage } from './pages/ProductPage';
import { SearchPage } from './pages/SearchPage';
import { SellerPage } from './pages/SellerPage';
import { WishlistPage } from './pages/WishlistPage';
import './styles.css';

function ScrollAndAssistant() {
  const location = useLocation();
  const productMatch = location.pathname.match(/^\/product\/([^/]+)$/);
  const productIds = productMatch ? [decodeURIComponent(productMatch[1])] : [];
  return <><AssistantWidget productIds={productIds} /><div className="app-routes"><Routes><Route path="/" element={<HomePage />} /><Route path="/search" element={<SearchPage />} /><Route path="/product/:id" element={<ProductPage />} /><Route path="/wishlist" element={<WishlistPage />} /><Route path="/compare" element={<ComparePage />} /><Route path="/seller" element={<SellerPage />} /><Route path="*" element={<HomePage />} /></Routes></div></>;
}

function App() {
  return <React.StrictMode><BrowserRouter><ShopProvider><Header /><ScrollAndAssistant /><Footer /></ShopProvider></BrowserRouter></React.StrictMode>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
