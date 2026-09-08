"use client";

import Image from "next/image";
import { Heart, Minus, Plus, ShoppingBag } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatMMK } from "@/lib/format";
import { getSupabaseBrowser } from "@/lib/supabase-client";
import type { Product } from "@/lib/types";
import { useCommerce } from "./commerce-provider";
import { Modal } from "./modal";

export function ProductModal({ product, onClose, onAuth, onBag }: { product: Product | null; onClose: () => void; onAuth: (intent: string) => void; onBag: () => void }) {
  const { user, addToBag } = useCommerce();
  const [selectedId, setSelectedId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const variant = useMemo(() => product?.variants.find((item) => item.id === selectedId) ?? product?.variants[0], [product, selectedId]);
  useEffect(() => { setSelectedId(product?.variants[0]?.id ?? ""); setQuantity(1); }, [product]);
  useEffect(() => {
    if (!product) return;
    if (user) void getSupabaseBrowser().from("vlr_recently_viewed").upsert({ user_id: user.id, product_id: product.id, viewed_at: new Date().toISOString() });
    else {
      const key = "veloire:recent:v1";
      const current = (() => { try { return JSON.parse(localStorage.getItem(key) ?? "[]") as string[]; } catch { return []; } })();
      localStorage.setItem(key, JSON.stringify([product.id, ...current.filter((id) => id !== product.id)].slice(0, 12)));
    }
  }, [product, user]);
  const wishlist = async () => {
    if (!user) return onAuth("save pieces to your wishlist");
    if (product) await getSupabaseBrowser().from("vlr_wishlist_items").upsert({ user_id: user.id, product_id: product.id });
  };
  const add = () => {
    if (!product || !variant || variant.stock < 1) return;
    addToBag(product, variant, quantity); onBag();
  };
  return <Modal open={Boolean(product)} onClose={onClose} className="product-modal">
    {product && variant && <div className="product-detail-grid">
      <div className="detail-gallery"><div className="detail-main-image"><Image src={product.primary_image_url} alt={product.name} fill sizes="(max-width: 800px) 100vw, 55vw" /></div><div className="detail-thumbs"><button><Image src={product.primary_image_url} alt="Product view" fill sizes="100px" /></button>{product.hover_image_url && <button><Image src={product.hover_image_url} alt="Detail view" fill sizes="100px" /></button>}</div></div>
      <div className="detail-info"><p className="eyebrow dark">{product.department?.name} · {product.category?.name}</p><h2>{product.name}</h2><p className="detail-price">{formatMMK(Number(product.base_price) + Number(variant.price_adjustment))}</p><p className="detail-description">{product.description}</p>
        <div className="variant-block"><span>Choose a variant</span><div className="variant-list">{product.variants.map((item) => <button className={item.id === variant.id ? "active" : ""} key={item.id} onClick={() => setSelectedId(item.id)} disabled={!item.stock}>{Object.values(item.option_values).join(" · ")} {!item.stock && "— Sold out"}</button>)}</div></div>
        <p className={`stock-note ${variant.stock <= variant.low_stock_threshold ? "low" : ""}`}>{variant.stock ? `${variant.stock} pieces available` : "Currently unavailable"}</p>
        <div className="detail-actions"><div className="quantity"><button onClick={() => setQuantity(Math.max(1, quantity - 1))}><Minus /></button><span>{quantity}</span><button onClick={() => setQuantity(Math.min(variant.stock, quantity + 1))}><Plus /></button></div><button className="primary-button" onClick={add} disabled={!variant.stock}><ShoppingBag />Add to bag</button><button className="icon-button" onClick={wishlist} aria-label="Add to wishlist"><Heart /></button></div>
        <div className="accordions"><details open><summary>Composition</summary><p>{product.material ?? "Selected materials chosen for lasting form and hand."}</p></details><details><summary>Care</summary><p>{product.care}</p></details><details><summary>Delivery & returns</summary><p>{product.shipping_note} {product.return_policy}</p></details></div>
      </div>
    </div>}
  </Modal>;
}
