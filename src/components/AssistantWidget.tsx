import { useState, type FormEvent } from 'react';
import { ArrowUp, Bot, Check, LoaderCircle, MessageCircle, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { askAssistant } from '../lib/catalog';

type Message = { role: 'user' | 'assistant'; text: string; ids?: string[] };
export function AssistantWidget({ productIds = [] }: { productIds?: string[] }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{ role: 'assistant', text: 'Tell me about your room, style, or budget. I’ll look at the pieces we actually have in the catalog.' }]);
  useEffect(() => { if (new URLSearchParams(location.search).get('assistant') === '1') setOpen(true); }, [location.search]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const prompt = question.trim();
    if (!prompt || loading) return;
    setQuestion('');
    setMessages((current) => [...current, { role: 'user', text: prompt }]);
    setLoading(true);
    try {
      const result = await askAssistant(prompt, productIds);
      setMessages((current) => [...current, { role: 'assistant', text: result.answer, ids: result.grounded_product_ids }]);
    } finally { setLoading(false); }
  };
  return <>
    <button className="assistant-launcher" onClick={() => setOpen(true)} aria-label="Open FurniFind shopping assistant"><MessageCircle size={20} /><span>Ask FurniFind</span></button>
    {open && <div className="assistant-backdrop" onClick={() => setOpen(false)}>
      <section className="assistant-panel" role="dialog" aria-modal="true" aria-labelledby="assistant-title" onClick={(event) => event.stopPropagation()}>
        <header className="assistant-header"><span className="assistant-avatar"><Bot size={19} /></span><div><h2 id="assistant-title">A little help finding it?</h2><p>Catalog-grounded furniture advice</p></div><button className="icon-button" onClick={() => setOpen(false)} aria-label="Close assistant"><X size={19} /></button></header>
        <div className="assistant-messages" aria-live="polite">{messages.map((message, index) => <div key={`${index}-${message.role}`} className={`chat-message ${message.role}`}><p>{message.text}</p>{message.ids && message.ids.length > 0 && <div className="chat-links">{message.ids.slice(0, 3).map((id) => <Link key={id} to={`/product/${id}`} onClick={() => setOpen(false)}>{id.replaceAll('-', ' ')} <Check size={12} /></Link>)}</div>}</div>)}{loading && <div className="chat-message assistant loading-message"><LoaderCircle size={16} className="spin" /> Looking through the catalog…</div>}</div>
        <form className="assistant-form" onSubmit={submit}><label className="sr-only" htmlFor="assistant-question">Ask a furniture question</label><input id="assistant-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Try ‘a compact desk under ₹700’" /><button type="submit" aria-label="Send question" disabled={!question.trim() || loading}><ArrowUp size={18} /></button></form>
      </section>
    </div>}
  </>;
}
