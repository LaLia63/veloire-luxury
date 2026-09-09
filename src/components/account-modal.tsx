"use client";

import Image from "next/image";
import Link from "next/link";
import { Bell, Camera, Heart, LoaderCircle, LogOut, PackageCheck, ShieldCheck, Sparkles, Trash2, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatMMK, titleCase } from "@/lib/format";
import { getSupabaseBrowser } from "@/lib/supabase-client";
import type { Order, Product } from "@/lib/types";
import { useCommerce } from "./commerce-provider";
import { Modal } from "./modal";

export function AccountModal({ open, onClose, onNotifications, products }: { open: boolean; onClose: () => void; onNotifications: () => void; products: Product[] }) {
  const { user, profile, wishlistIds, toggleWishlist, refreshProfile } = useCommerce();
  const [orders, setOrders] = useState<Order[]>([]);
  const [saved, setSaved] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const savedProducts = useMemo(() => products.filter((product) => wishlistIds.includes(product.id)), [products, wishlistIds]);

  useEffect(() => {
    if (!open || !user) return;
    void (async () => {
      const result = await getSupabaseBrowser().from("vlr_orders").select("id,order_number,status,payment_status,grand_total,created_at,loyalty_points_earned").eq("user_id", user.id).order("created_at", { ascending: false });
      setOrders((result.data as Order[] | null) ?? []);
    })();
  }, [open, user]);

  if (!user) return null;

  const updateProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileMessage("");
    const form = new FormData(event.currentTarget);
    const { error } = await getSupabaseBrowser().from("vlr_profiles").update({ full_name: form.get("name"), phone: form.get("phone"), date_of_birth: form.get("dob") || null, gender: form.get("gender") || null }).eq("id", user.id);
    if (error) { setProfileMessage("Profile could not be saved. Please try again."); return; }
    await refreshProfile();
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  const uploadAvatar = async (file: File) => {
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
      setProfileMessage("Choose a JPG, PNG or WEBP image under 5 MB.");
      return;
    }
    const localPreview = URL.createObjectURL(file);
    setAvatarPreview(localPreview);
    setAvatarUploading(true);
    setProfileMessage("");
    const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${user.id}/avatar-${Date.now()}.${extension}`;
    const supabase = getSupabaseBrowser();
    const { error: uploadError } = await supabase.storage.from("vlr-profile-avatars").upload(path, file, { cacheControl: "3600", upsert: false });
    if (uploadError) {
      setProfileMessage("Profile photo upload failed. Please try again.");
      setAvatarPreview("");
      setAvatarUploading(false);
      URL.revokeObjectURL(localPreview);
      return;
    }
    const { data } = supabase.storage.from("vlr-profile-avatars").getPublicUrl(path);
    const { error: updateError } = await supabase.from("vlr_profiles").update({ avatar_url: data.publicUrl }).eq("id", user.id);
    if (updateError) setProfileMessage("The photo uploaded, but your profile could not be updated.");
    else { setAvatarPreview(data.publicUrl); await refreshProfile(); setProfileMessage("Profile photo updated."); }
    setAvatarUploading(false);
    URL.revokeObjectURL(localPreview);
  };

  return <Modal open={open} onClose={onClose} className="account-modal">
    <div className="account-hero">
      <div className="avatar-editor">
        {avatarPreview || profile?.avatar_url ? <Image src={avatarPreview || profile?.avatar_url || ""} alt="Profile" fill sizes="88px" unoptimized={avatarPreview.startsWith("blob:")} /> : <UserRound />}
        <label aria-label="Change profile photo"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => event.target.files?.[0] && void uploadAvatar(event.target.files[0])}/>{avatarUploading ? <LoaderCircle className="avatar-spinner" /> : <Camera />}</label>
      </div>
      <p className="eyebrow">MY VÉLOIRE</p><h2>Welcome, <em>{profile?.full_name?.split(" ")[0] ?? "Maison Client"}</em></h2><p>{user.email}</p>
    </div>
    <div className="account-body">
      <div className="privilege-card"><div><Sparkles /><span>VÉLOIRE Privilege</span></div><strong>{profile?.loyalty_points ?? 0}</strong><p>points available · 10 points = 100 MMK</p></div>
      <div className="account-grid">
        <section>
          <div className="account-section-title"><PackageCheck /><h3>Order history</h3></div>
          {orders.length ? orders.map((order) => <article className="order-row" key={order.id}><div><strong>{order.order_number}</strong><span>{new Date(order.created_at).toLocaleDateString()}</span></div><div><span>{titleCase(order.status)}</span><strong>{formatMMK(order.grand_total)}</strong></div></article>) : <div className="small-empty"><PackageCheck /><p>No orders yet. Your future pieces will be kept here.</p></div>}
          <div className="account-section-title wishlist-title"><Heart /><h3>Wishlist</h3></div>
          {savedProducts.length ? <div className="wishlist-list">{savedProducts.map((product) => <article key={product.id}><div><Image src={product.primary_image_url} alt={product.name} fill sizes="76px"/></div><span><strong>{product.name}</strong><small>{formatMMK(product.base_price)}</small></span><button onClick={() => void toggleWishlist(product.id)} aria-label={`Remove ${product.name} from wishlist`}><Trash2 /></button></article>)}</div> : <div className="small-empty"><Heart /><p>Your saved pieces will appear here.</p></div>}
          <div className="account-links"><button onClick={() => { onClose(); onNotifications(); }}><Bell />Notifications</button>{profile?.role === "admin" && <Link href="/admin"><ShieldCheck />Open admin dashboard</Link>}</div>
        </section>
        <section>
          <div className="account-section-title"><UserRound /><h3>Profile</h3></div>
          <form className="profile-form" onSubmit={updateProfile}><label>Full name<input name="name" defaultValue={profile?.full_name ?? ""} required/></label><label>Phone<input name="phone" defaultValue={profile?.phone ?? ""} pattern="[+0-9 ]{7,20}"/></label><label>Date of birth <span>Optional</span><input type="date" name="dob" defaultValue={profile?.date_of_birth ?? ""}/></label><label>Gender <span>Optional</span><select name="gender" defaultValue={profile?.gender ?? ""}><option value="">Prefer not to say</option><option value="female">Female</option><option value="male">Male</option><option value="non_binary">Non-binary</option></select></label><button className="secondary-button">{saved ? "Saved" : "Save profile"}</button></form>
          {profileMessage && <p className="profile-message" role="status">{profileMessage}</p>}
          <button className="signout" onClick={async () => { await getSupabaseBrowser().auth.signOut(); onClose(); }}><LogOut />Sign out</button>
        </section>
      </div>
    </div>
  </Modal>;
}
