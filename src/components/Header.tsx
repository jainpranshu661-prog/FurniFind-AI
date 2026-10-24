import { useEffect, useState, type FormEvent } from 'react';
import { Armchair, ArrowRight, Heart, Search, Scale, Moon, Sun } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { categories } from '../data/products';
import { useShop } from '../context/ShopContext';

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { wishlist, comparison, darkMode, toggleDarkMode } = useShop();
  const [query, setQuery] = useState('');
  useEffect(() => { setQuery(new URLSearchParams(location.search).get('q') ?? ''); }, [location.search]);
  const submit = (event: FormEvent) => { event.preventDefault(); navigate(`/search?q=${encodeURIComponent(query.trim())}`); };
  return <>
    <div className="announcement">Thoughtful pieces for the way you live <span>·</span> Free delivery over ₹500</div>
    <header className="site-header">
      <div className="header-top wrap">
        <Link className="brand" to="/" aria-label="FurniFind home"><span className="brand-mark"><Armchair size={21} strokeWidth={1.7} /></span><span>furnifind<span className="brand-ai"> AI</span></span></Link>
        <form className="header-search" onSubmit={submit} role="search">
          <label className="sr-only" htmlFor="global-search">Search furniture</label><Search size={18} aria-hidden="true" />
          <input id="global-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="What are you looking for?" />
          <button type="submit" aria-label="Submit search"><ArrowRight size={18} /></button>
        </form>
        <div className="header-actions">
          <Link className="header-icon-link" to="/wishlist" aria-label={`Wishlist, ${wishlist.length} items`}><Heart size={20} /><span className="action-label">Saved</span>{wishlist.length > 0 && <span className="count-badge">{wishlist.length}</span>}</Link>
          <Link className="header-icon-link" to="/compare" aria-label={`Compare, ${comparison.length} items`}><Scale size={20} /><span className="action-label">Compare</span>{comparison.length > 0 && <span className="count-badge">{comparison.length}</span>}</Link>
          <button className="theme-toggle" type="button" onClick={toggleDarkMode} aria-label={`Switch to ${darkMode ? 'light' : 'dark'} mode`} title={`Switch to ${darkMode ? 'light' : 'dark'} mode`}>{darkMode ? <Sun size={18} /> : <Moon size={18} />}</button>
        </div>
      </div>
      <nav className="category-nav wrap" aria-label="Furniture categories">
        <Link to="/">Home</Link>
        {categories.map((category) => <Link key={category} to={`/search?category=${encodeURIComponent(category)}`}>{category}</Link>)}
        <Link to="/seller">Sell furniture</Link>
        <Link className="nav-ai" to="/?assistant=1">Meet your shopping assistant <ArrowRight size={14} /></Link>
      </nav>
    </header>
  </>;
}
