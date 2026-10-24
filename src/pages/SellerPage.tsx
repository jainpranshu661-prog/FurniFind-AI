import { useCallback, useEffect, useState, type FormEvent } from 'react';
import axios from 'axios';
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { ArrowRight, LogOut, Pencil, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createSellerProduct, deleteSellerProduct, getSellerProducts, updateSellerProduct, type SellerListing, type SellerProductInput, type SellerProductStatus } from '../lib/catalog';
import { formatCurrency } from '../lib/currency';
import { firebaseAuth } from '../lib/firebase';

type AuthMode = 'sign-in' | 'register';
type ListingFields = Omit<SellerProductInput, 'currency'>;

const emptyFields: ListingFields = {
  title: '',
  description: '',
  category: '',
  price: 0,
  material: '',
  color: '',
  dimensions: '',
  imageUrl: '',
};

function errorMessage(error: unknown): string {
  if (axios.isAxiosError<{ detail?: unknown }>(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string') return detail;
  }
  return error instanceof Error ? error.message : 'Could not complete the request. Please try again.';
}

function listingFields(listing: SellerListing): ListingFields {
  return {
    title: listing.name,
    description: listing.description,
    category: listing.category,
    price: listing.price,
    material: listing.material,
    color: listing.color,
    dimensions: listing.dimensions ?? '',
    imageUrl: listing.image,
  };
}

export function SellerPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [listingLoading, setListingLoading] = useState(false);
  const [listingError, setListingError] = useState('');
  const [listings, setListings] = useState<SellerListing[]>([]);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<SellerListing | null>(null);
  const [fields, setFields] = useState<ListingFields>(emptyFields);

  useEffect(() => {
    if (!firebaseAuth) {
      setAuthLoading(false);
      return;
    }
    return onAuthStateChanged(
      firebaseAuth,
      (currentUser) => {
        setUser(currentUser);
        setAuthError('');
        setAuthLoading(false);
      },
      (error) => {
        setAuthError(errorMessage(error));
        setAuthLoading(false);
      },
    );
  }, []);

  useEffect(() => {
    let active = true;
    if (!user) {
      setListings([]);
      setListingLoading(false);
      setListingError('');
      return () => { active = false; };
    }
    setListingLoading(true);
    setListingError('');
    user.getIdToken()
      .then(getSellerProducts)
      .then((items) => { if (active) setListings(items); })
      .catch((error: unknown) => { if (active) setListingError(errorMessage(error)); })
      .finally(() => { if (active) setListingLoading(false); });
    return () => { active = false; };
  }, [user, reload]);

  const authenticate = async (event: FormEvent) => {
    event.preventDefault();
    if (!firebaseAuth) return;
    setAuthError('');
    try {
      if (authMode === 'register') {
        await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
      }
    } catch (error) {
      setAuthError(errorMessage(error));
    }
  };

  const signOutSeller = async () => {
    if (!firebaseAuth) return;
    try {
      await signOut(firebaseAuth);
    } catch (error) {
      setAuthError(errorMessage(error));
    }
  };

  const updateField = <K extends keyof ListingFields>(key: K, value: ListingFields[K]) => {
    setFields((current) => ({ ...current, [key]: value }));
  };

  const resetForm = () => {
    setFields(emptyFields);
    setEditing(null);
  };

  const submitProduct = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setFormError('');
    setSuccess('');
    setSaving(true);
    try {
      const idToken = await user.getIdToken();
      if (editing) {
        await updateSellerProduct(editing.id, fields, idToken);
        setSuccess('Your listing has been updated.');
      } else {
        await createSellerProduct({ ...fields, currency: 'INR' }, idToken);
        setSuccess('Your product has been published.');
      }
      resetForm();
      setReload((current) => current + 1);
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = useCallback(async (listing: SellerListing, status: SellerProductStatus) => {
    if (!user) return;
    setListingError('');
    setSuccess('');
    try {
      const idToken = await user.getIdToken();
      const updated = await updateSellerProduct(listing.id, { status }, idToken);
      setListings((current) => current.map((item) => item.id === updated.id ? updated : item));
      setSuccess(`Listing status changed to ${status}.`);
    } catch (error) {
      setListingError(errorMessage(error));
    }
  }, [user]);

  const removeListing = async (listing: SellerListing) => {
    if (!user || !window.confirm(`Delete "${listing.name}"? This cannot be undone.`)) return;
    setListingError('');
    setSuccess('');
    try {
      await deleteSellerProduct(listing.id, await user.getIdToken());
      setListings((current) => current.filter((item) => item.id !== listing.id));
      if (editing?.id === listing.id) resetForm();
      setSuccess('The listing has been deleted.');
    } catch (error) {
      setListingError(errorMessage(error));
    }
  };

  const startEditing = (listing: SellerListing) => {
    setEditing(listing);
    setFields(listingFields(listing));
    setFormError('');
    setSuccess('');
  };

  if (!firebaseAuth) {
    return <main className="page-main wrap seller-page"><div className="breadcrumb"><Link to="/">Home</Link><span>/</span><span>Sell furniture</span></div><section className="seller-panel"><p className="eyebrow">Seller studio</p><h1>Firebase setup needed</h1><p>Set the Firebase Web app values in your local <code>.env</code>, enable Email/Password sign-in in Firebase Console, then restart Vite.</p></section></main>;
  }

  if (authLoading) {
    return <main className="page-main wrap seller-page"><div className="page-loading">Checking seller sign-in…</div></main>;
  }

  return <main className="page-main wrap seller-page">
    <div className="breadcrumb"><Link to="/">Home</Link><span>/</span><span>Seller studio</span></div>
    <section className="seller-panel">
      <p className="eyebrow">Seller studio</p>
      <h1>{user ? 'Manage your pieces.' : 'A place for your pieces.'}</h1>
      <p className="seller-intro">Sign in to create and manage your own listings. Prices are shown in Indian rupees.</p>
      {!user ? <>
        <div className="seller-mode-switch" role="group" aria-label="Seller account action">
          <button type="button" className={authMode === 'register' ? 'selected' : ''} onClick={() => { setAuthMode('register'); setAuthError(''); }}>Create seller account</button>
          <button type="button" className={authMode === 'sign-in' ? 'selected' : ''} onClick={() => { setAuthMode('sign-in'); setAuthError(''); }}>Sign in</button>
        </div>
        <form className="seller-form seller-auth-form" onSubmit={authenticate}>
          <label>Email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Password<input type="password" autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          {authError && <p className="notice notice-error" role="alert">{authError}</p>}
          <button className="button button-dark" type="submit">{authMode === 'register' ? 'Create account' : 'Sign in'} <ArrowRight size={15} /></button>
        </form>
      </> : <>
        <div className="seller-signed-in">
          <span>Signed in as {user.email}</span>
          <button type="button" className="text-link" onClick={() => void signOutSeller()}><LogOut size={14} /> Sign out</button>
        </div>
        {authError && <p className="notice notice-error" role="alert">{authError}</p>}
        {success && <p className="notice notice-success" role="status">{success}</p>}
        <form className="seller-form" onSubmit={submitProduct}>
          <h2>{editing ? `Edit ${editing.name}` : 'Create a listing'}</h2>
          <label>Product title<input required maxLength={180} value={fields.title} onChange={(event) => updateField('title', event.target.value)} /></label>
          <label>Description<textarea required maxLength={5000} rows={4} value={fields.description} onChange={(event) => updateField('description', event.target.value)} /></label>
          <div className="seller-form-row">
            <label>Category<input required maxLength={80} value={fields.category} onChange={(event) => updateField('category', event.target.value)} /></label>
            <label>Price (INR)<input type="number" required min="0.01" step="0.01" value={fields.price || ''} onChange={(event) => updateField('price', Number(event.target.value))} /></label>
          </div>
          <div className="seller-form-row">
            <label>Material<input required maxLength={180} value={fields.material} onChange={(event) => updateField('material', event.target.value)} /></label>
            <label>Color<input required maxLength={100} value={fields.color} onChange={(event) => updateField('color', event.target.value)} /></label>
          </div>
          <label>Dimensions <span className="seller-optional">(optional)</span><input maxLength={180} value={fields.dimensions ?? ''} onChange={(event) => updateField('dimensions', event.target.value)} /></label>
          <label>Image URL<input type="url" required value={fields.imageUrl} onChange={(event) => updateField('imageUrl', event.target.value)} placeholder="https://example.com/furniture.jpg" /></label>
          {formError && <p className="notice notice-error" role="alert">{formError}</p>}
          <div className="seller-form-actions">
            <button className="button button-dark" type="submit" disabled={saving}>{saving ? 'Saving listing…' : editing ? 'Save changes' : 'Publish product'} <ArrowRight size={15} /></button>
            {editing && <button className="button button-outline" type="button" onClick={resetForm} disabled={saving}>Cancel editing</button>}
          </div>
        </form>
        <section className="seller-listings" aria-labelledby="seller-listings-title">
          <div className="seller-listings-heading"><h2 id="seller-listings-title">Your listings</h2><button className="text-link" type="button" onClick={() => setReload((current) => current + 1)}>Refresh</button></div>
          {listingError && <p className="notice notice-error" role="alert">{listingError}</p>}
          {listingLoading ? <p className="page-loading">Loading your listings…</p> : listings.length ? (
            <div className="seller-listing-list">
              {listings.map((listing) => <article className="seller-listing" key={listing.id}>
                <div className="seller-listing-details">
                  <Link to={`/product/${listing.id}`}><strong>{listing.name}</strong></Link>
                  <span>{formatCurrency(listing.price)} · {listing.category}</span>
                </div>
                <label className="seller-status">Status
                  <select value={listing.status} onChange={(event) => void changeStatus(listing, event.target.value as SellerProductStatus)}>
                    <option value="active">Active</option><option value="draft">Draft</option><option value="archived">Archived</option>
                  </select>
                </label>
                <div className="seller-listing-actions">
                  <button className="button button-outline" type="button" onClick={() => startEditing(listing)}><Pencil size={14} /> Edit</button>
                  <button className="button button-outline" type="button" onClick={() => void removeListing(listing)}><Trash2 size={14} /> Delete</button>
                </div>
              </article>)}
            </div>
          ) : <p className="seller-empty">You haven’t listed anything yet. Create a listing above to get started.</p>}
        </section>
      </>}
    </section>
  </main>;
}
