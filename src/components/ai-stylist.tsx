"use client";

import { ArrowUp, Bot, ShoppingBag, Sparkles } from "lucide-react";
import { useState } from "react";
import type { Product } from "@/lib/types";
import { useCommerce } from "./commerce-provider";
import { Modal } from "./modal";

type Message = { role: "assistant" | "user"; text: string; actions?: string[] };
type AIAction = { type: "add_to_bag" | "remove_from_bag" | "set_quantity"; variantId: string; quantity?: number };

export function AIStylist({ open, onClose, products, onBag }: { open: boolean; onClose: () => void; products: Product[]; onBag: () => void }) {
  const { bag, user, profile, addToBag, removeFromBag, updateQuantity } = useCommerce();
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", text: "Bonsoir. I’m your VÉLOIRE Private Stylist. အခမ်းအနား၊ style သို့မဟုတ် လက်ရှိ bag အကြောင်း မြန်မာလိုဖြစ်စေ English လိုဖြစ်စေ မေးနိုင်ပါတယ်။" }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const applyActions = (actions: AIAction[]) => {
    const notes: string[] = [];
    for (const action of actions) {
      const product = products.find((item) => item.variants.some((variant) => variant.id === action.variantId));
      const variant = product?.variants.find((item) => item.id === action.variantId);
      if (!product || !variant) continue;
      if (action.type === "add_to_bag") { addToBag(product, variant, action.quantity ?? 1); notes.push(`${product.name} added`); }
      if (action.type === "remove_from_bag") { removeFromBag(variant.id); notes.push(`${product.name} removed`); }
      if (action.type === "set_quantity") { updateQuantity(variant.id, action.quantity ?? 1); notes.push(`${product.name} quantity updated`); }
    }
    if (notes.length) onBag();
    return notes;
  };

  const send = async (suggestion?: string) => {
    const text = (suggestion ?? input).trim(); if (!text || loading) return;
    const next = [...messages, { role: "user", text } as Message]; setMessages(next); setInput(""); setLoading(true);
    try {
      const response = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next.slice(-8), bag: bag.map((item) => ({ variantId: item.variantId, quantity: item.quantity })), user: user ? { name: profile?.full_name, signedIn: true } : { signedIn: false } }) });
      const data = await response.json();
      const notes = applyActions((data.actions ?? []) as AIAction[]);
      setMessages((current) => [...current, { role: "assistant", text: data.message ?? "I’m unable to compose a recommendation just now.", actions: notes }]);
    } catch { setMessages((current) => [...current, { role: "assistant", text: "The atelier connection is quiet for a moment. ခဏအကြာ ပြန်မေးကြည့်ပေးပါ။" }]); }
    finally { setLoading(false); }
  };
  return <Modal open={open} onClose={onClose} className="ai-modal"><div className="ai-head"><div><p className="eyebrow">VÉLOIRE AI</p><h2>Private <em>Stylist</em></h2></div><span><Sparkles /> Bilingual agent</span></div><div className="ai-body"><div className="ai-messages">{messages.map((message, index) => <div className={`ai-message ${message.role}`} key={index}>{message.role === "assistant" && <Bot />}<div><p>{message.text}</p>{message.actions?.map((action) => <small key={action}><ShoppingBag />{action}</small>)}</div></div>)}{loading && <div className="ai-thinking"><i/><i/><i/></div>}</div><div className="suggestion-chips"><button onClick={() => send("Build an evening look under 2,000,000 MMK")}>Evening edit</button><button onClick={() => send("Bag ထဲက ပစ္စည်းအရေအတွက် ပြောပြပါ")}>Bag စစ်မယ်</button><button onClick={() => send("Add the Palais Leather Bag to my bag")}>Agent add to bag</button></div><form className="ai-input" onSubmit={(event) => { event.preventDefault(); void send(); }}><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask in English or မြန်မာ…" aria-label="Message your private stylist"/><button disabled={!input.trim() || loading} aria-label="Send"><ArrowUp /></button></form><p className="ai-guardrail">Recommendations use the live VÉLOIRE catalog only. Price, stock and permissions are always verified by the server.</p></div></Modal>;
}
