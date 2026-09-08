"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Bot, Heart, Menu, Search, ShoppingBag, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { formatMMK } from "@/lib/format";
import { getSupabaseBrowser } from "@/lib/supabase-client";
import type { Department, Product } from "@/lib/types";
import { AccountModal } from "./account-modal";
import { AIStylist } from "./ai-stylist";
import { AuthModal } from "./auth-modal";
import { BagDrawer } from "./bag-drawer";
import { CommerceProvider, useCommerce } from "./commerce-provider";
import { Modal } from "./modal";
import { ProductModal } from "./product-modal";

function Experience({ products, departments }: { products: Product[]; departments: Department[] }) {
  const { bag, user, profile } = useCommerce();
  const [department, setDepartment] = useState(departments[0]?.slug ?? "women");
  const [category, setCategory] = useState<string | null>(null);
  const [selected, setSelected] = useState<Product | null>(null);
  const [bagOpen, setBagOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authIntent, setAuthIntent] = useState("continue");
  const [accountOpen, setAccountOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const activeDepartment = departments.find((item) => item.slug === department);
  const visibleProducts = useMemo(() => products.filter((product) => product.department?.slug === department && (!category || product.category?.slug === category)), [products, department, category]);
  const searchResults = useMemo(() => products.filter((product) => `${product.name} ${product.description} ${product.category?.name}`.toLowerCase().includes(query.toLowerCase())), [products, query]);
  const askAuth = (intent: string) => { setAuthIntent(intent); setAuthOpen(true); };
  const wishlist = async (product: Product) => {
    if (!user) return askAuth("save pieces to your private wishlist");
    await getSupabaseBrowser().from("vlr_wishlist_items").upsert({ user_id: user.id, product_id: product.id });
  };

  return <main>
    <header className="floating-nav">
      <Link className="wordmark" href="#top">VÉLOIRE</Link>
      <nav aria-label="Main navigation"><Link href="#top">Home</Link><Link href="#shop">Shop</Link><Link href="#collections">Collections</Link><button onClick={() => setAiOpen(true)}>VÉLOIRE AI</button><Link href="#about">About</Link></nav>
      <div className="nav-actions"><button aria-label="Search" onClick={() => setSearchOpen(true)}><Search /></button><button aria-label="Wishlist" onClick={() => user ? setAccountOpen(true) : askAuth("view and curate your wishlist")}><Heart /></button><button aria-label={user ? "Account" : "Sign in"} className="account-trigger" onClick={() => user ? setAccountOpen(true) : askAuth("access your private account")}>{profile?.avatar_url ? <Image src={profile.avatar_url} alt="" width={28} height={28} /> : <UserRound />}<span>{user ? "Account" : "Sign in"}</span></button><button aria-label="Shopping bag" className="bag-trigger" onClick={() => setBagOpen(true)}><ShoppingBag /><b>{bag.reduce((sum, item) => sum + item.quantity, 0)}</b></button><button className="menu-trigger" aria-label="Menu" onClick={() => setMenuOpen(!menuOpen)}><Menu /></button></div>
      {menuOpen && <div className="mobile-menu"><a href="#shop" onClick={() => setMenuOpen(false)}>Shop</a><a href="#collections" onClick={() => setMenuOpen(false)}>Collections</a><button onClick={() => { setAiOpen(true); setMenuOpen(false); }}>VÉLOIRE AI</button><a href="#about" onClick={() => setMenuOpen(false)}>About</a></div>}
    </header>

    <section className="hero" id="top"><Image src="/images/campaign/veloire-hero.webp" alt="Woman in an oxblood evening gown inside a cinematic stone gallery" fill priority loading="eager" sizes="100vw"/><div className="hero-shade"/><div className="hero-copy"><p className="eyebrow">La Collection No. 01 · 2026</p><h1>Atelier<br/><em>Nocturne</em></h1><p>Form, shadow and quiet confidence.</p><a className="text-link" href="#shop">Discover the collection <span>↗</span></a></div><span className="hero-index">V / 01</span></section>

    <section className="shop-preview" id="shop"><div className="section-heading"><div><p className="eyebrow dark">The edit</p><h2>Objects of<br/><em>presence</em></h2></div><p>Considered silhouettes and enduring objects, composed for a life lived with intention.</p></div><div className="department-tabs">{departments.map((item) => <button className={item.slug === department ? "active" : ""} key={item.id} onClick={() => { setDepartment(item.slug); setCategory(null); }}>{item.name}</button>)}</div><div className="category-tags"><button className={!category ? "active" : ""} onClick={() => setCategory(null)}>View all</button>{activeDepartment?.categories.map((item) => <button className={item.slug === category ? "active" : ""} key={item.id} onClick={() => setCategory(item.slug)}>{item.name}</button>)}</div><div className="product-grid">{visibleProducts.length ? visibleProducts.map((product, index) => <article className={`product-card card-${(index % 3) + 1}`} key={product.id}><button className="product-image" onClick={() => setSelected(product)}><Image src={product.primary_image_url} alt={product.name} fill sizes="(max-width: 760px) 100vw, 33vw"/><span>{product.is_new_arrival ? "New arrival" : product.category?.name}</span></button><div className="product-meta"><button className="product-title" onClick={() => setSelected(product)}><h3>{product.name}</h3><p>{formatMMK(product.base_price)}</p></button><button aria-label={`Save ${product.name}`} onClick={() => void wishlist(product)}><Heart /></button></div></article>) : <div className="no-results"><p>No pieces are currently presented in this edit.</p><button onClick={() => setCategory(null)}>View the full department</button></div>}</div></section>

    <section className="campaign-split" id="collections"><div className="campaign-image"><Image src="/images/campaign/veloire-men.webp" alt="Man in precise noir tailoring inside a stone gallery" fill sizes="(max-width: 800px) 100vw, 50vw"/></div><div className="campaign-copy"><p className="eyebrow">Collection II</p><h2>The quiet<br/><em>form</em></h2><p>Tailoring distilled to line, proportion and material. Designed to speak softly—and remain.</p><button onClick={() => { setDepartment("men"); setCategory(null); document.getElementById("shop")?.scrollIntoView(); }}>Enter menswear <ArrowRight /></button></div></section>
    <section className="services"><article><span>01</span><h3>Private curation</h3><p>Your AI stylist understands the live collection and may compose, compare, add, remove or refine your bag in English and မြန်မာ.</p><button onClick={() => setAiOpen(true)}>Consult the stylist</button></article><article><span>02</span><h3>VÉLOIRE Privilege</h3><p>Receive 10 points for every 200,000 MMK of a verified order, with considered redemption on future pieces.</p><button onClick={() => user ? setAccountOpen(true) : askAuth("join VÉLOIRE Privilege")}>View your privilege</button></article><article><span>03</span><h3>From atelier to arrival</h3><p>Follow preparation, quality inspection, signature packaging and delivery from your private account.</p><button onClick={() => user ? setAccountOpen(true) : askAuth("track your order")}>Track an order</button></article></section>
    <section className="objects-banner"><Image src="/images/campaign/veloire-accessories.webp" alt="Oxblood handbag, minimalist watch and fragrance" fill sizes="100vw"/><div><p className="eyebrow">Objets Privés</p><h2>Rituals,<br/><em>refined.</em></h2><button onClick={() => { setDepartment("women"); setCategory("handbags"); document.getElementById("shop")?.scrollIntoView(); }}>Discover accessories</button></div></section>
    <footer id="about"><div><Link className="wordmark" href="#top">VÉLOIRE</Link><p>A digital maison of fashion and considered living.</p></div><div><span>Client services</span><button onClick={() => setAiOpen(true)}>Private stylist</button><button onClick={() => user ? setAccountOpen(true) : askAuth("access your orders")}>Orders & returns</button><a href="mailto:concierge@veloire.com">Concierge</a></div><div><span>Maison</span><a href="#collections">Collections</a><a href="#shop">Women · Men · Kids</a><a href="#about">Our codes</a></div><small>© 2026 VÉLOIRE · Myanmar / MMK</small></footer>
    <button className="ai-fab" onClick={() => setAiOpen(true)}><Bot/><span>Private Stylist</span></button>

    <ProductModal product={selected} onClose={() => setSelected(null)} onAuth={askAuth} onBag={() => setBagOpen(true)}/>
    <BagDrawer open={bagOpen} onClose={() => setBagOpen(false)} onAuth={askAuth}/>
    <AIStylist open={aiOpen} onClose={() => setAiOpen(false)} products={products} onBag={() => setBagOpen(true)}/>
    <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} intent={authIntent}/>
    <AccountModal open={accountOpen} onClose={() => setAccountOpen(false)}/>
    <Modal open={searchOpen} onClose={() => setSearchOpen(false)} className="search-modal"><p className="eyebrow dark">Search the Maison</p><div className="search-field"><Search/><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search silhouettes, objects, materials…"/></div><div className="search-results">{query && searchResults.slice(0, 6).map((product) => <button key={product.id} onClick={() => { setSelected(product); setSearchOpen(false); }}><div><Image src={product.primary_image_url} alt="" fill sizes="70px"/></div><span><strong>{product.name}</strong><small>{product.category?.name} · {formatMMK(product.base_price)}</small></span><ArrowRight/></button>)}{query && !searchResults.length && <div className="no-results"><p>No piece matches “{query}”.</p><small>Try a category, material or occasion.</small></div>}</div></Modal>
  </main>;
}

export function Storefront({ products, departments }: { products: Product[]; departments: Department[] }) {
  return <CommerceProvider products={products}><Experience products={products} departments={departments}/></CommerceProvider>;
}
