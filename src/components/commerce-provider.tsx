"use client";

import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-client";
import type { BagItem, Notification, Product, Profile, Variant } from "@/lib/types";

type CommerceContextValue = {
  bag: BagItem[]; session: Session | null; user: User | null; profile: Profile | null; authReady: boolean;
  wishlistIds: string[];
  notifications: Notification[];
  unreadNotificationCount: number;
  addToBag: (product: Product, variant: Variant, quantity?: number) => void;
  updateQuantity: (variantId: string, quantity: number) => void;
  removeFromBag: (variantId: string) => void;
  clearBag: () => Promise<void>;
  toggleWishlist: (productId: string) => Promise<"added" | "removed">;
  refreshNotifications: () => Promise<void>;
  markNotificationRead: (notificationId: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const CommerceContext = createContext<CommerceContextValue | null>(null);
const BAG_KEY = "veloire:guest-bag:v1";

function clampQuantity(quantity: number, stock: number) {
  return Math.max(0, Math.min(Math.trunc(quantity), stock));
}

function reconcileBagWithCatalog(current: BagItem[], products: Product[]) {
  const byVariant = new Map<string, { product: Product; variant: Variant }>();
  for (const product of products) {
    for (const variant of product.variants) byVariant.set(variant.id, { product, variant });
  }
  const items: BagItem[] = [];
  const removedVariantIds: string[] = [];
  const quantityUpdates: { variant_id: string; quantity: number }[] = [];
  let changed = false;

  for (const item of current) {
    const live = byVariant.get(item.variantId);
    if (!live || !live.variant.is_active) {
      removedVariantIds.push(item.variantId);
      changed = true;
      continue;
    }
    const quantity = clampQuantity(item.quantity, live.variant.stock);
    if (quantity < 1) {
      removedVariantIds.push(item.variantId);
      changed = true;
      continue;
    }
    if (quantity !== item.quantity) quantityUpdates.push({ variant_id: item.variantId, quantity });
    if (quantity !== item.quantity || item.product !== live.product || item.variant !== live.variant) changed = true;
    items.push({ variantId: item.variantId, product: live.product, variant: live.variant, quantity });
  }

  return { changed, items, removedVariantIds, quantityUpdates };
}

export function CommerceProvider({ children, products, catalogAuthoritative }: { children: React.ReactNode; products: Product[]; catalogAuthoritative: boolean }) {
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const [bag, setBag] = useState<BagItem[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [authReady, setAuthReady] = useState(false);

  const loadProfile = useCallback(async (userId: string) => {
    const { data } = await supabase.from("vlr_profiles").select("*").eq("id", userId).maybeSingle();
    setProfile((data as Profile | null) ?? null);
  }, [supabase]);

  const loadWishlist = useCallback(async (userId: string) => {
    const { data } = await supabase.from("vlr_wishlist_items").select("product_id").eq("user_id", userId);
    setWishlistIds(((data ?? []) as { product_id: string }[]).map((row) => row.product_id));
  }, [supabase]);

  const loadNotifications = useCallback(async (userId: string) => {
    const { data } = await supabase.from("vlr_notifications").select("id,order_id,type,title,message,is_read,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(40);
    setNotifications((data as Notification[] | null) ?? []);
  }, [supabase]);

  const mergeGuestBag = useCallback(async (userId: string, guestBag: BagItem[]) => {
    const { data: remote } = await supabase.from("vlr_bag_items").select("variant_id, quantity").eq("user_id", userId);
    const quantities = new Map<string, number>(((remote ?? []) as { variant_id: string; quantity: number }[]).map((row) => [row.variant_id, Number(row.quantity)]));
    for (const item of guestBag) {
      quantities.set(item.variantId, clampQuantity((quantities.get(item.variantId) ?? 0) + item.quantity, item.variant.stock));
    }
    const rows = [...quantities.entries()].filter(([, quantity]) => quantity > 0).map(([variant_id, quantity]) => ({ user_id: userId, variant_id, quantity }));
    if (rows.length) await supabase.from("vlr_bag_items").upsert(rows, { onConflict: "user_id,variant_id" });
    const merged = rows.map((row) => {
      const product = products.find((candidate) => candidate.variants.some((variant) => variant.id === row.variant_id));
      const variant = product?.variants.find((candidate) => candidate.id === row.variant_id);
      return product && variant ? { variantId: row.variant_id, product, variant, quantity: row.quantity } : null;
    }).filter(Boolean) as BagItem[];
    setBag(merged);
    localStorage.removeItem(BAG_KEY);
  }, [products, supabase]);

  useEffect(() => {
    let active = true;
    const saved = localStorage.getItem(BAG_KEY);
    let guestBag: BagItem[] = [];
    if (saved) {
      try { guestBag = JSON.parse(saved) as BagItem[]; } catch { localStorage.removeItem(BAG_KEY); }
    }
    supabase.auth.getSession().then(async ({ data }: { data: { session: Session | null } }) => {
      if (!active) return;
      setBag(guestBag);
      setSession(data.session);
      if (data.session?.user) {
        await Promise.all([loadProfile(data.session.user.id), loadWishlist(data.session.user.id), loadNotifications(data.session.user.id), mergeGuestBag(data.session.user.id, guestBag)]);
      }
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, nextSession: Session | null) => {
      setSession(nextSession);
      if (nextSession?.user) {
        const currentGuest = (() => { try { return JSON.parse(localStorage.getItem(BAG_KEY) ?? "[]") as BagItem[]; } catch { return []; } })();
        setTimeout(() => void Promise.all([loadProfile(nextSession.user.id), loadWishlist(nextSession.user.id), loadNotifications(nextSession.user.id), mergeGuestBag(nextSession.user.id, currentGuest)]), 0);
      } else { setProfile(null); setWishlistIds([]); setNotifications([]); }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [loadNotifications, loadProfile, loadWishlist, mergeGuestBag, supabase]);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) return;
    const channel = supabase
      .channel(`vlr-notifications-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "vlr_notifications", filter: `user_id=eq.${userId}` }, (payload: { new: Record<string, unknown> }) => {
        const notification = payload.new as Notification;
        setNotifications((current) => current.some((item) => item.id === notification.id) ? current : [notification, ...current].slice(0, 40));
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [session?.user.id, supabase]);

  // Product updates from the admin refresh the server props. Reconcile every
  // stored bag snapshot with those live products so price, media, options and
  // stock cannot remain stale, and remove variants that are no longer sold.
  useEffect(() => {
    if (!catalogAuthoritative) return;
    const reconciled = reconcileBagWithCatalog(bag, products);
    if (!reconciled.changed) return;
    const updateTimer = window.setTimeout(() => setBag(reconciled.items), 0);

    const userId = session?.user.id;
    if (!userId) {
      localStorage.setItem(BAG_KEY, JSON.stringify(reconciled.items));
      return () => window.clearTimeout(updateTimer);
    }
    if (reconciled.removedVariantIds.length) {
      void supabase.from("vlr_bag_items").delete().eq("user_id", userId).in("variant_id", reconciled.removedVariantIds);
    }
    if (reconciled.quantityUpdates.length) {
      void supabase.from("vlr_bag_items").upsert(
        reconciled.quantityUpdates.map((item) => ({ ...item, user_id: userId })),
        { onConflict: "user_id,variant_id" },
      );
    }
    return () => window.clearTimeout(updateTimer);
  }, [bag, catalogAuthoritative, products, session?.user.id, supabase]);

  const persist = useCallback((next: BagItem[]) => {
    setBag(next);
    if (!session?.user) localStorage.setItem(BAG_KEY, JSON.stringify(next));
  }, [session]);

  const syncItem = useCallback(async (variantId: string, quantity: number) => {
    if (!session?.user) return;
    if (quantity <= 0) await supabase.from("vlr_bag_items").delete().eq("user_id", session.user.id).eq("variant_id", variantId);
    else await supabase.from("vlr_bag_items").upsert({ user_id: session.user.id, variant_id: variantId, quantity }, { onConflict: "user_id,variant_id" });
  }, [session, supabase]);

  const addToBag = useCallback((product: Product, variant: Variant, quantity = 1) => {
    const current = bag.find((item) => item.variantId === variant.id)?.quantity ?? 0;
    const nextQuantity = clampQuantity(current + quantity, variant.stock);
    const next = bag.some((item) => item.variantId === variant.id)
      ? bag.map((item) => item.variantId === variant.id ? { ...item, quantity: nextQuantity } : item)
      : [...bag, { variantId: variant.id, product, variant, quantity: nextQuantity }];
    persist(next.filter((item) => item.quantity > 0));
    void syncItem(variant.id, nextQuantity);
  }, [bag, persist, syncItem]);

  const updateQuantity = useCallback((variantId: string, quantity: number) => {
    const item = bag.find((candidate) => candidate.variantId === variantId);
    if (!item) return;
    const nextQuantity = clampQuantity(quantity, item.variant.stock);
    persist(bag.map((candidate) => candidate.variantId === variantId ? { ...candidate, quantity: nextQuantity } : candidate).filter((candidate) => candidate.quantity > 0));
    void syncItem(variantId, nextQuantity);
  }, [bag, persist, syncItem]);

  const removeFromBag = useCallback((variantId: string) => updateQuantity(variantId, 0), [updateQuantity]);
  const clearBag = useCallback(async () => {
    persist([]);
    if (!session?.user) return;
    const { error } = await supabase.from("vlr_bag_items").delete().eq("user_id", session.user.id);
    if (error) throw error;
  }, [persist, session, supabase]);
  const toggleWishlist = useCallback(async (productId: string) => {
    if (!session?.user) throw new Error("Sign in to use your wishlist");
    const exists = wishlistIds.includes(productId);
    setWishlistIds((current) => exists ? current.filter((id) => id !== productId) : [...current, productId]);
    const query = exists
      ? supabase.from("vlr_wishlist_items").delete().eq("user_id", session.user.id).eq("product_id", productId)
      : supabase.from("vlr_wishlist_items").insert({ user_id: session.user.id, product_id: productId });
    const { error } = await query;
    if (error) {
      setWishlistIds((current) => exists ? [...current, productId] : current.filter((id) => id !== productId));
      throw error;
    }
    return exists ? "removed" : "added";
  }, [session, supabase, wishlistIds]);
  const refreshNotifications = useCallback(async () => { if (session?.user) await loadNotifications(session.user.id); }, [loadNotifications, session]);
  const markNotificationRead = useCallback(async (notificationId: string) => {
    if (!session?.user) return;
    setNotifications((current) => current.map((item) => item.id === notificationId ? { ...item, is_read: true } : item));
    const { error } = await supabase.from("vlr_notifications").update({ is_read: true }).eq("id", notificationId).eq("user_id", session.user.id);
    if (error) await loadNotifications(session.user.id);
  }, [loadNotifications, session, supabase]);
  const markAllNotificationsRead = useCallback(async () => {
    if (!session?.user) return;
    setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
    const { error } = await supabase.from("vlr_notifications").update({ is_read: true }).eq("user_id", session.user.id).eq("is_read", false);
    if (error) await loadNotifications(session.user.id);
  }, [loadNotifications, session, supabase]);
  const refreshProfile = useCallback(async () => { if (session?.user) await loadProfile(session.user.id); }, [loadProfile, session]);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = async () => {
      await context.registerTool({ name: "read_bag", title: "Read VÉLOIRE bag", description: "Read the exact pieces, variants and quantities currently visible in the VÉLOIRE shopping bag.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, execute: () => ({ itemCount: bag.reduce((sum, item) => sum + item.quantity, 0), items: bag.map((item) => ({ variantId: item.variantId, name: item.product.name, variant: item.variant.option_values, quantity: item.quantity })) }) }, { signal: lifecycle.signal });
      await context.registerTool({ name: "update_bag_quantity", title: "Update VÉLOIRE bag", description: "Set the quantity of one exact variant already present in the visible bag. Use zero to remove it; stock limits are enforced.", inputSchema: { type: "object", properties: { variantId: { type: "string" }, quantity: { type: "integer", minimum: 0 } }, required: ["variantId", "quantity"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: (input) => { const value = input as { variantId?: unknown; quantity?: unknown }; if (typeof value.variantId !== "string" || !Number.isInteger(value.quantity) || Number(value.quantity) < 0) throw new Error("variantId and a non-negative integer quantity are required"); const item = bag.find((candidate) => candidate.variantId === value.variantId); if (!item) throw new Error("That variant is not in the current bag"); const quantity = Math.min(Number(value.quantity), item.variant.stock); updateQuantity(value.variantId, quantity); return { variantId: value.variantId, quantity, status: quantity === 0 ? "removed" : "updated" }; } }, { signal: lifecycle.signal });
    };
    void register().catch(() => undefined);
    return () => lifecycle.abort();
  }, [bag, updateQuantity]);

  return <CommerceContext.Provider value={{ bag, session, user: session?.user ?? null, profile, authReady, wishlistIds, notifications, unreadNotificationCount: notifications.filter((item) => !item.is_read).length, addToBag, updateQuantity, removeFromBag, clearBag, toggleWishlist, refreshNotifications, markNotificationRead, markAllNotificationsRead, refreshProfile }}>{children}</CommerceContext.Provider>;
}

export function useCommerce() {
  const value = useContext(CommerceContext);
  if (!value) throw new Error("useCommerce must be used inside CommerceProvider");
  return value;
}
