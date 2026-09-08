"use client";

import Image from "next/image";
import { Check, ChevronLeft, Download, Minus, Plus, ShoppingBag, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { formatMMK } from "@/lib/format";
import { getSupabaseBrowser } from "@/lib/supabase-client";
import { useCommerce } from "./commerce-provider";
import { Modal } from "./modal";

type CheckoutResult = { id: string; order_number: string; subtotal: number; delivery_fee: number; loyalty_discount: number; grand_total: number; loyalty_points_earned: number; created_at: string };

export function BagDrawer({ open, onClose, onAuth }: { open: boolean; onClose: () => void; onAuth: (intent: string) => void }) {
  const { bag, user, profile, updateQuantity, removeFromBag, clearBag } = useCommerce();
  const [checkout, setCheckout] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [order, setOrder] = useState<CheckoutResult | null>(null);
  const [proofName, setProofName] = useState("");
  const receiptRef = useRef<HTMLDivElement>(null);
  const subtotal = bag.reduce((sum, item) => sum + (Number(item.product.base_price) + Number(item.variant.price_adjustment)) * item.quantity, 0);

  const beginCheckout = () => {
    if (!user) { onClose(); onAuth("securely check out and track your order"); return; }
    setCheckout(true);
  };
  const placeOrder = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSubmitting(true); setError("");
    const form = new FormData(event.currentTarget);
    const { data: sessionData } = await getSupabaseBrowser().auth.getSession();
    const response = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session?.access_token ?? ""}` }, body: JSON.stringify({ items: bag.map((item) => ({ variantId: item.variantId, quantity: item.quantity })), contact: { email: form.get("email"), phone: form.get("phone") }, deliveryAddress: { recipient_name: form.get("name"), address_line_1: form.get("address"), city: form.get("city"), country: "Myanmar" }, deliveryMethod: "standard", loyaltyPoints: Number(form.get("points") ?? 0) }) });
    const data = await response.json();
    if (!response.ok) setError(data.error ?? "Order could not be created.");
    else { setOrder(data.order); clearBag(); }
    setSubmitting(false);
  };
  const uploadProof = async (file: File) => {
    if (!user || !order) return;
    if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) { setError("Upload a JPG, PNG or WEBP image under 8 MB."); return; }
    setSubmitting(true); setError("");
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "-");
    const path = `${user.id}/${order.id}/${Date.now()}-${safeName}`;
    const supabase = getSupabaseBrowser();
    const { error: uploadError } = await supabase.storage.from("vlr-payment-proofs").upload(path, file, { upsert: false });
    if (uploadError) setError("Payment proof upload failed. Please try again.");
    else {
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch("/api/payment", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session?.access_token ?? ""}` }, body: JSON.stringify({ orderId: order.id, proofPath: path }) });
      if (response.ok) setProofName(file.name); else setError("The image uploaded, but submission could not be recorded.");
    }
    setSubmitting(false);
  };
  const downloadReceipt = async (kind: "png" | "pdf") => {
    if (!receiptRef.current || !order) return;
    const { toPng } = await import("html-to-image");
    const image = await toPng(receiptRef.current, { pixelRatio: 2, backgroundColor: "#f1ece4" });
    if (kind === "png") { const link = document.createElement("a"); link.download = `${order.order_number}-receipt.png`; link.href = image; link.click(); return; }
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    pdf.addImage(image, "PNG", 12, 12, 186, 0); pdf.save(`${order.order_number}-receipt.pdf`);
  };

  return <Modal open={open} onClose={onClose} className="bag-panel">
    {order ? <div className="confirmation"><div className="envelope"><div className="receipt" ref={receiptRef}><p className="receipt-mark">VÉLOIRE</p><p className="eyebrow dark">Digital receipt</p><h2>Merci, {profile?.full_name?.split(" ")[0] ?? "Maison Client"}</h2><dl><div><dt>Order</dt><dd>{order.order_number}</dd></div><div><dt>Date</dt><dd>{new Date(order.created_at).toLocaleDateString()}</dd></div><div><dt>Subtotal</dt><dd>{formatMMK(order.subtotal)}</dd></div><div><dt>Delivery</dt><dd>{formatMMK(order.delivery_fee)}</dd></div><div><dt>Privilege</dt><dd>- {formatMMK(order.loyalty_discount)}</dd></div><div className="receipt-total"><dt>Total</dt><dd>{formatMMK(order.grand_total)}</dd></div></dl><p>Potential points after verification: <strong>{order.loyalty_points_earned}</strong></p></div></div><div className="receipt-actions"><button onClick={() => void downloadReceipt("png")}><Download /> PNG</button><button onClick={() => void downloadReceipt("pdf")}><Download /> PDF</button></div><div className="payment-card"><p className="eyebrow dark">KPay manual payment</p><h3>{formatMMK(order.grand_total)}</h3><p>VÉLOIRE Maison · 09 000 000 000</p><label className={proofName ? "uploaded" : ""}><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => event.target.files?.[0] && void uploadProof(event.target.files[0])}/>{proofName ? <><Check />{proofName}</> : <><Upload />Upload payment screenshot</>}</label></div>{error && <p className="form-error">{error}</p>}</div>
    : checkout ? <div className="checkout-panel"><button className="back-button" onClick={() => setCheckout(false)}><ChevronLeft />Back to bag</button><p className="eyebrow dark">Secure checkout</p><h2>Delivery<br/><em>details</em></h2><form onSubmit={placeOrder}><div className="form-row"><label>Full name<input name="name" required defaultValue={profile?.full_name ?? ""}/></label><label>Phone<input name="phone" required pattern="[+0-9 ]{7,20}" defaultValue={profile?.phone ?? ""}/></label></div><label>Email<input name="email" type="email" required defaultValue={user?.email ?? ""}/></label><label>Delivery address<textarea name="address" required rows={3}/></label><label>City / Township<input name="city" required/></label><label>Privilege points to redeem <span>10 pts = 100 MMK · max 20%</span><input name="points" type="number" min="0" max={profile?.loyalty_points ?? 0} step="10" defaultValue="0"/></label><div className="checkout-total"><span>Estimated total</span><strong>{formatMMK(subtotal + 5000)}</strong></div>{error && <p className="form-error">{error}</p>}<button className="primary-button" disabled={submitting}>{submitting ? "Validating your order…" : "Place order & continue to KPay"}</button></form></div>
    : <div className="bag-content"><p className="eyebrow dark">Your selection</p><h2>Shopping <em>bag</em></h2>{bag.length ? <><div className="bag-list">{bag.map((item) => <article key={item.variantId}><div className="bag-thumb"><Image src={item.product.primary_image_url} alt={item.product.name} fill sizes="96px" /></div><div><h3>{item.product.name}</h3><p>{Object.values(item.variant.option_values).join(" · ")}</p><strong>{formatMMK((Number(item.product.base_price) + Number(item.variant.price_adjustment)) * item.quantity)}</strong><div className="bag-row-actions"><div className="quantity"><button onClick={() => updateQuantity(item.variantId, item.quantity - 1)}><Minus /></button><span>{item.quantity}</span><button onClick={() => updateQuantity(item.variantId, item.quantity + 1)} disabled={item.quantity >= item.variant.stock}><Plus /></button></div><button className="remove" onClick={() => removeFromBag(item.variantId)}><Trash2 />Remove</button></div></div></article>)}</div><div className="bag-summary"><div><span>Subtotal</span><strong>{formatMMK(subtotal)}</strong></div><p>Delivery and privilege redemption are calculated securely at checkout.</p><button className="primary-button" onClick={beginCheckout}>Continue to checkout</button></div></> : <div className="empty-state"><ShoppingBag /><h3>Your bag is waiting.</h3><p>Pieces selected by you—or your private stylist—will appear here.</p><button onClick={onClose}>Continue discovering</button></div>}</div>}
  </Modal>;
}
