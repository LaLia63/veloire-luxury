"use client";

import Image from "next/image";
import Link from "next/link";
import { Bell, Heart, LogOut, PackageCheck, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { formatMMK, titleCase } from "@/lib/format";
import { getSupabaseBrowser } from "@/lib/supabase-client";
import type { Order } from "@/lib/types";
import { useCommerce } from "./commerce-provider";
import { Modal } from "./modal";

export function AccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, profile, refreshProfile } = useCommerce();
  const [orders, setOrders] = useState<Order[]>([]);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!open || !user) return;
    void (async () => {
      const result = await getSupabaseBrowser().from("vlr_orders").select("id,order_number,status,payment_status,grand_total,created_at,loyalty_points_earned").eq("user_id", user.id).order("created_at", { ascending: false });
      setOrders((result.data as Order[] | null) ?? []);
    })();
  }, [open, user]);
  if (!user) return null;
  const updateProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await getSupabaseBrowser().from("vlr_profiles").update({ full_name: form.get("name"), phone: form.get("phone"), date_of_birth: form.get("dob") || null, gender: form.get("gender") || null }).eq("id", user.id);
    await refreshProfile(); setSaved(true); setTimeout(() => setSaved(false), 1800);
  };
  return <Modal open={open} onClose={onClose} className="account-modal"><div className="account-hero"><div>{profile?.avatar_url ? <Image src={profile.avatar_url} alt="Profile" width={72} height={72} /> : <UserRound />}</div><p className="eyebrow">MY VÉLOIRE</p><h2>Welcome, <em>{profile?.full_name?.split(" ")[0] ?? "Maison Client"}</em></h2><p>{user.email}</p></div><div className="account-body"><div className="privilege-card"><div><Sparkles /><span>VÉLOIRE Privilege</span></div><strong>{profile?.loyalty_points ?? 0}</strong><p>points available · 10 points = 100 MMK</p></div><div className="account-grid"><section><div className="account-section-title"><PackageCheck /><h3>Order history</h3></div>{orders.length ? orders.map((order) => <article className="order-row" key={order.id}><div><strong>{order.order_number}</strong><span>{new Date(order.created_at).toLocaleDateString()}</span></div><div><span>{titleCase(order.status)}</span><strong>{formatMMK(order.grand_total)}</strong></div></article>) : <div className="small-empty"><PackageCheck /><p>No orders yet. Your future pieces will be kept here.</p></div>}<div className="account-links"><button><Heart />Wishlist</button><button><Bell />Notifications</button>{profile?.role === "admin" && <Link href="/admin"><ShieldCheck />Open admin dashboard</Link>}</div></section><section><div className="account-section-title"><UserRound /><h3>Profile</h3></div><form className="profile-form" onSubmit={updateProfile}><label>Full name<input name="name" defaultValue={profile?.full_name ?? ""} required/></label><label>Phone<input name="phone" defaultValue={profile?.phone ?? ""} pattern="[+0-9 ]{7,20}"/></label><label>Date of birth <span>Optional</span><input type="date" name="dob" defaultValue={profile?.date_of_birth ?? ""}/></label><label>Gender <span>Optional</span><select name="gender" defaultValue={profile?.gender ?? ""}><option value="">Prefer not to say</option><option value="female">Female</option><option value="male">Male</option><option value="non_binary">Non-binary</option></select></label><button className="secondary-button">{saved ? "Saved" : "Save profile"}</button></form><button className="signout" onClick={async () => { await getSupabaseBrowser().auth.signOut(); onClose(); }}><LogOut />Sign out</button></section></div></div></Modal>;
}
