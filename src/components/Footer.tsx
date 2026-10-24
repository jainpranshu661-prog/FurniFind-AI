import { ArrowUpRight, Armchair } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Footer() {
  return <footer className="site-footer"><div className="wrap footer-main"><Link to="/" className="brand footer-brand"><span className="brand-mark"><Armchair size={20} /></span><span>furnifind<span className="brand-ai"> AI</span></span></Link><p>Good pieces. Better spaces.<br />Find the ones that feel like you.</p><div className="footer-links"><Link to="/search">Shop all <ArrowUpRight size={14} /></Link><Link to="/wishlist">Your saved pieces <ArrowUpRight size={14} /></Link><Link to="/compare">Compare finds <ArrowUpRight size={14} /></Link></div></div><div className="wrap footer-bottom"><span>© 2026 FurniFind AI</span><span>Thoughtfully found, not endlessly scrolled.</span></div></footer>;
}
