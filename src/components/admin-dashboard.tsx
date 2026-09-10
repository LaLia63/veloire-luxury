"use client";

import Image from "next/image";
import Link from "next/link";
import { Activity, ArrowLeft, BarChart3, Bell, Boxes, ChevronRight, CircleDollarSign, Download, Edit3, Eye, FileSpreadsheet, ImageIcon, LayoutDashboard, PackageCheck, Plus, RefreshCw, RotateCcw, Save, ShieldCheck, Sparkles, Trash2, Upload, Users, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { exportAdminRows, type AdminExportColumn, type AdminExportValue } from "@/lib/admin-export";
import { formatMMK, titleCase } from "@/lib/format";
import { getSupabaseBrowser } from "@/lib/supabase-client";

type Dict = Record<string, unknown>;
type Variant = { id?: string; sku: string; option_values: Record<string, string>; price_adjustment: number; stock: number; low_stock_threshold: number; is_active: boolean };
type Product = { id: string; name: string; slug: string; description: string; product_type: string; base_price: number; material: string | null; care: string | null; shipping_note: string | null; return_policy: string | null; primary_image_url: string; hover_image_url: string | null; video_url: string | null; department_id: number; category_id: number | null; is_available: boolean; is_featured: boolean; is_new_arrival: boolean; created_at?: string; variants: Variant[]; department?: { id: number; name: string } | null; category?: { id: number; name: string } | null };
type Customer = { id: string; email: string; full_name: string | null; role: string; loyalty_points: number; disabled: boolean; is_active?: boolean; disabled_at?: string | null; disabled_reason?: string | null; created_at?: string; last_sign_in_at: string | null };
type Item = { id: string; product_name: string; variant_snapshot: Record<string, string>; sku: string; unit_price: number; quantity: number; line_total: number; primary_image_url: string | null };
type Order = { id: string; order_number: string; user_id: string; status: string; payment_status: string; contact_email: string; contact_phone: string; delivery_address: Record<string, string>; delivery_method: string; subtotal: number; discount: number; loyalty_discount: number; delivery_fee: number; grand_total: number; created_at: string; items: Item[]; customer: Customer | null };
type Payment = { id: string; order_id: string; user_id: string; amount: number; status: string; proofSignedUrl: string | null; submitted_at: string | null; rejection_reason: string | null };
type Category = { id: number; department_id: number; name: string; slug: string; is_active: boolean; sort_order: number };
type Department = { id: number; name: string };
type ReturnRow = { id: string; order_id: string; user_id?: string; status: string; reason: string; photo_paths?: string[] | null; admin_note?: string | null; requested_at: string; updated_at?: string };
type Notification = { id: string; title: string; message: string; is_read: boolean; created_at: string };
type AdminData = {
  summary: { revenue: number; orders: number; customers: number; pendingPayments: number; returns: number; activeProducts: number };
  analytics: { revenueByDay: { date: string; revenue: number; orders: number }[]; ordersByStatus: { label: string; value: number }[]; paymentsByStatus: { label: string; value: number }[] };
  products: Product[]; orders: Order[]; payments: Payment[]; returns: ReturnRow[]; customers: Customer[]; departments: Department[]; categories: Category[];
  aiSettings: { enabled: boolean; updated_at?: string }; adminNotifications: Notification[]; lowStock: Dict[];
};

const sections = [
  ["overview", "Overview", LayoutDashboard], ["orders", "Orders", PackageCheck], ["payments", "Payments", CircleDollarSign],
  ["catalog", "Catalog", Boxes], ["customers", "Customers", Users], ["returns", "Returns", RotateCcw], ["ai", "AI Service", Sparkles],
] as const;
const orderStatuses = ["confirmed", "preparing", "quality_inspection", "luxury_packaging", "shipped", "delivered", "cancelled", "return_in_progress", "refunded"];
const returnStatuses = ["requested", "under_review", "approved", "rejected", "item_received", "inspection", "refund_approved", "refunded"];

type ExportRecord = Record<string, AdminExportValue>;

function exportColumn(header: string, key: string, width = 18, format?: string): AdminExportColumn<ExportRecord> {
  return { header, width, format, value: (row) => row[key] };
}

function exportDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date;
}

function exportObject(value?: Record<string, string> | null) {
  return Object.entries(value ?? {}).map(([key, item]) => `${titleCase(key)}: ${item}`).join(", ");
}

const orderExportColumns = [
  exportColumn("Order number", "orderNumber", 18), exportColumn("Order ID", "orderId", 38), exportColumn("Created at", "createdAt", 22),
  exportColumn("Customer", "customer", 24), exportColumn("Customer email", "customerEmail", 30), exportColumn("Contact phone", "phone", 18),
  exportColumn("Order status", "status", 20), exportColumn("Payment status", "paymentStatus", 20), exportColumn("Delivery method", "deliveryMethod", 18),
  exportColumn("Delivery address", "deliveryAddress", 42), exportColumn("SKU", "sku", 18), exportColumn("Product", "product", 28),
  exportColumn("Variant", "variant", 28), exportColumn("Unit price (MMK)", "unitPrice", 20, "#,##0"), exportColumn("Quantity", "quantity", 12, "#,##0"),
  exportColumn("Line total (MMK)", "lineTotal", 20, "#,##0"), exportColumn("Subtotal (MMK)", "subtotal", 20, "#,##0"),
  exportColumn("Discount (MMK)", "discount", 20, "#,##0"), exportColumn("Loyalty discount (MMK)", "loyaltyDiscount", 24, "#,##0"),
  exportColumn("Delivery fee (MMK)", "deliveryFee", 22, "#,##0"), exportColumn("Grand total (MMK)", "grandTotal", 22, "#,##0"),
];

const customerExportColumns = [
  exportColumn("Customer ID", "id", 38), exportColumn("Full name", "name", 24), exportColumn("Email", "email", 30), exportColumn("Role", "role", 14),
  exportColumn("Loyalty points", "points", 18, "#,##0"), exportColumn("Access", "access", 14), exportColumn("Last sign in", "lastSignIn", 22),
  exportColumn("Joined at", "joinedAt", 22), exportColumn("Disabled at", "disabledAt", 22), exportColumn("Disabled reason", "disabledReason", 32),
];

const productExportColumns = [
  exportColumn("Product ID", "productId", 38), exportColumn("Name", "name", 28), exportColumn("Slug", "slug", 28), exportColumn("Product type", "productType", 18),
  exportColumn("Department", "department", 20), exportColumn("Category", "category", 20), exportColumn("Description", "description", 44),
  exportColumn("Material", "material", 30), exportColumn("Care", "care", 30), exportColumn("Shipping note", "shippingNote", 32), exportColumn("Return policy", "returnPolicy", 32),
  exportColumn("Base price (MMK)", "basePrice", 20, "#,##0"), exportColumn("Available", "available", 14), exportColumn("Featured", "featured", 14),
  exportColumn("New arrival", "newArrival", 14), exportColumn("Primary image URL", "primaryImage", 48), exportColumn("Hover image URL", "hoverImage", 48),
  exportColumn("Video URL", "videoUrl", 48), exportColumn("SKU", "sku", 18), exportColumn("Options", "options", 28),
  exportColumn("Price adjustment (MMK)", "priceAdjustment", 24, "#,##0"), exportColumn("Stock", "stock", 12, "#,##0"),
  exportColumn("Low stock threshold", "lowStock", 22, "#,##0"), exportColumn("Variant active", "variantActive", 16), exportColumn("Created at", "createdAt", 22),
];

const returnExportColumns = [
  exportColumn("Return ID", "returnId", 38), exportColumn("Order number", "orderNumber", 18), exportColumn("Order ID", "orderId", 38),
  exportColumn("Customer", "customer", 30), exportColumn("Status", "status", 20), exportColumn("Reason", "reason", 42), exportColumn("Admin note", "adminNote", 42),
  exportColumn("Photo count", "photoCount", 14, "#,##0"), exportColumn("Requested at", "requestedAt", 22), exportColumn("Updated at", "updatedAt", 22),
];

function ordersForExport(rows: Order[]): ExportRecord[] {
  return rows.flatMap((order) => (order.items.length ? order.items : [null]).map((item) => ({
    orderNumber: order.order_number, orderId: order.id, createdAt: exportDate(order.created_at), customer: order.customer?.full_name ?? "Maison client",
    customerEmail: order.contact_email || order.customer?.email || "", phone: order.contact_phone, status: titleCase(order.status), paymentStatus: titleCase(order.payment_status),
    deliveryMethod: titleCase(order.delivery_method), deliveryAddress: exportObject(order.delivery_address), sku: item?.sku ?? "", product: item?.product_name ?? "",
    variant: exportObject(item?.variant_snapshot), unitPrice: Number(item?.unit_price ?? 0), quantity: Number(item?.quantity ?? 0), lineTotal: Number(item?.line_total ?? 0),
    subtotal: Number(order.subtotal), discount: Number(order.discount), loyaltyDiscount: Number(order.loyalty_discount), deliveryFee: Number(order.delivery_fee), grandTotal: Number(order.grand_total),
  })));
}

function customersForExport(rows: Customer[]): ExportRecord[] {
  return rows.map((customer) => ({ id: customer.id, name: customer.full_name ?? "", email: customer.email, role: titleCase(customer.role), points: Number(customer.loyalty_points),
    access: customer.disabled ? "Disabled" : "Active", lastSignIn: exportDate(customer.last_sign_in_at), joinedAt: exportDate(customer.created_at),
    disabledAt: exportDate(customer.disabled_at), disabledReason: customer.disabled_reason ?? "" }));
}

function productsForExport(rows: Product[]): ExportRecord[] {
  return rows.flatMap((product) => (product.variants.length ? product.variants : [null]).map((variant) => ({
    productId: product.id, name: product.name, slug: product.slug, productType: product.product_type, department: product.department?.name ?? String(product.department_id),
    category: product.category?.name ?? (product.category_id ? String(product.category_id) : ""), description: product.description, material: product.material ?? "", care: product.care ?? "",
    shippingNote: product.shipping_note ?? "", returnPolicy: product.return_policy ?? "", basePrice: Number(product.base_price), available: product.is_available,
    featured: product.is_featured, newArrival: product.is_new_arrival, primaryImage: product.primary_image_url, hoverImage: product.hover_image_url ?? "", videoUrl: product.video_url ?? "",
    sku: variant?.sku ?? "", options: exportObject(variant?.option_values), priceAdjustment: Number(variant?.price_adjustment ?? 0), stock: Number(variant?.stock ?? 0),
    lowStock: Number(variant?.low_stock_threshold ?? 0), variantActive: variant?.is_active ?? false, createdAt: exportDate(product.created_at),
  })));
}

function returnsForExport(rows: ReturnRow[], orders: Order[]): ExportRecord[] {
  const orderMap = new Map(orders.map((order) => [order.id, order]));
  return rows.map((item) => { const order = orderMap.get(item.order_id); return {
    returnId: item.id, orderNumber: order?.order_number ?? "", orderId: item.order_id, customer: order?.customer?.full_name || order?.contact_email || item.user_id || "",
    status: titleCase(item.status), reason: item.reason, adminNote: item.admin_note ?? "", photoCount: item.photo_paths?.length ?? 0,
    requestedAt: exportDate(item.requested_at), updatedAt: exportDate(item.updated_at),
  }; });
}

export function AdminDashboard() {
  const [data, setData] = useState<AdminData | null>(null);
  const [section, setSection] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const load = useCallback(async () => {
    const { data: auth } = await getSupabaseBrowser().auth.getSession();
    if (!auth.session) { setError("Sign in with the admin account to continue."); setLoading(false); return; }
    const response = await fetch("/api/admin", { headers: { Authorization: `Bearer ${auth.session.access_token}` }, cache: "no-store" });
    const payload = await response.json().catch(() => ({})) as AdminData & { error?: string };
    if (!response.ok) setError(payload.error ?? "Admin access is required."); else { setData(payload); setError(""); }
    setLoading(false);
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => { const supabase = getSupabaseBrowser(); const channel = supabase.channel("vlr-admin-live").on("postgres_changes", { event: "INSERT", schema: "public", table: "vlr_notifications", filter: "audience=eq.admin" }, () => void load()).subscribe(); return () => { void supabase.removeChannel(channel); }; }, [load]);

  const act = useCallback(async (payload: Dict) => {
    setNotice(""); const { data: auth } = await getSupabaseBrowser().auth.getSession();
    const response = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.session?.access_token ?? ""}` }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) { setNotice(result.error ?? "The change could not be saved."); return false; }
    setNotice("Change saved successfully."); await load(); return true;
  }, [load]);

  const unread = data?.adminNotifications.filter((item) => !item.is_read).length ?? 0;
  return <main className="admin-shell"><aside><Link href="/" className="admin-brand">VÉLOIRE <span>Administration</span></Link><nav>{sections.map(([id, label, Icon]) => <button key={id} className={section === id ? "active" : ""} onClick={() => setSection(id)}><Icon />{label}{id === "payments" && (data?.summary.pendingPayments ?? 0) > 0 ? <b>{data?.summary.pendingPayments}</b> : id === "overview" && unread > 0 ? <b>{unread}</b> : <ChevronRight />}</button>)}</nav><Link href="/" className="admin-back"><ArrowLeft />Storefront</Link></aside><section className="admin-main"><header><div><p className="eyebrow dark">Maison control</p><h1>{sections.find(([id]) => id === section)?.[1]}</h1></div><button onClick={() => { setLoading(true); void load(); }}><RefreshCw />Refresh</button></header>{notice && <p className="admin-action-message" role="status">{notice}</p>}{loading && <div className="admin-loading"><i /><p>Securing the dashboard…</p></div>}{error && <div className="admin-denied"><ShieldCheck /><h2>Private administration</h2><p>{error}</p><Link href="/">Return to VÉLOIRE</Link></div>}{data && !loading && !error && section === "overview" && <Overview data={data} act={act}/>} {data && !loading && !error && section === "orders" && <Orders rows={data.orders} selected={selectedOrder} setSelected={setSelectedOrder} act={act}/>} {data && !loading && !error && section === "payments" && <Payments rows={data.payments} orders={data.orders} customers={data.customers} act={act}/>} {data && !loading && !error && section === "catalog" && <Catalog data={data} editing={editingProduct} setEditing={setEditingProduct} act={act}/>} {data && !loading && !error && section === "customers" && <Customers rows={data.customers} act={act}/>} {data && !loading && !error && section === "returns" && <Returns rows={data.returns} orders={data.orders} act={act}/>} {data && !loading && !error && section === "ai" && <AI settings={data.aiSettings} act={act}/>}</section></main>;
}

function Overview({ data, act }: { data: AdminData; act: (p: Dict) => Promise<boolean> }) {
  return <><div className="metric-grid"><article><span>Verified revenue</span><strong>{formatMMK(data.summary.revenue)}</strong><CircleDollarSign /></article><article><span>Orders</span><strong>{data.summary.orders}</strong><PackageCheck /></article><article><span>Customers</span><strong>{data.summary.customers}</strong><Users /></article><article><span>Payments to review</span><strong>{data.summary.pendingPayments}</strong><Activity /></article></div><div className="analytics-grid"><RevenueChart rows={data.analytics.revenueByDay}/><Bars title="Orders by status" rows={data.analytics.ordersByStatus}/></div><div className="admin-two admin-overview-lower"><div className="data-table"><h3>Inventory attention</h3>{data.lowStock.length ? data.lowStock.slice(0, 7).map((row, index) => <div className="compact-row" key={String(row.id ?? index)}><span>{String((row.product as { name?: string } | null)?.name ?? row.sku ?? "Variant")}</span><strong>{String(row.stock ?? 0)} left</strong></div>) : <p className="admin-empty">Stock levels are healthy.</p>}</div><div className="data-table"><div className="panel-heading"><h3>Admin notifications</h3>{data.adminNotifications.some((item) => !item.is_read) && <button onClick={() => void act({ action: "mark_admin_notifications_read" })}>Mark read</button>}</div>{data.adminNotifications.length ? data.adminNotifications.slice(0, 6).map((item) => <article className={`admin-notification${item.is_read ? "" : " unread"}`} key={item.id}><Bell /><div><strong>{item.title}</strong><p>{item.message}</p><time>{new Date(item.created_at).toLocaleString()}</time></div></article>) : <p className="admin-empty">No notifications yet.</p>}</div></div></>;
}

function RevenueChart({ rows }: { rows: { date: string; revenue: number }[] }) {
  const max = Math.max(1, ...rows.map((row) => Number(row.revenue))); const points = rows.map((row, i) => `${rows.length < 2 ? 50 : i / (rows.length - 1) * 100},${94 - Number(row.revenue) / max * 82}`).join(" ");
  return <section className="chart-card"><div className="panel-heading"><div><p className="eyebrow dark">Last 14 days</p><h2>Revenue movement</h2></div><BarChart3 /></div><svg viewBox="0 0 100 100" role="img" aria-label="Verified revenue over the last fourteen days" preserveAspectRatio="none"><polyline className="chart-area" points={`0,100 ${points} 100,100`}/><polyline className="chart-line" points={points}/></svg><div className="chart-labels"><span>{rows[0]?.date.slice(5)}</span><strong>{formatMMK(max)}</strong><span>{rows.at(-1)?.date.slice(5)}</span></div></section>;
}
function Bars({ title, rows }: { title: string; rows: { label: string; value: number }[] }) { const max = Math.max(1, ...rows.map((row) => row.value)); return <section className="chart-card"><div className="panel-heading"><div><p className="eyebrow dark">Distribution</p><h2>{title}</h2></div><Activity /></div><div className="bar-chart">{rows.length ? rows.map((row) => <div key={row.label}><span>{titleCase(row.label)}</span><i><b style={{ width: `${Math.max(4, row.value / max * 100)}%` }}/></i><strong>{row.value}</strong></div>) : <p className="admin-empty">No data yet.</p>}</div></section>; }

function Orders({ rows, selected, setSelected, act }: { rows: Order[]; selected: Order | null; setSelected: (o: Order | null) => void; act: (p: Dict) => Promise<boolean> }) {
  const exportRows = ordersForExport(rows);
  return <div className="admin-workspace"><section className="admin-table-card"><Heading eyebrow="Customer purchases" title="All orders" action={<ExportButtons rows={exportRows} columns={orderExportColumns} fileBase="veloire-orders" sheetName="Orders"/>}/><div className="table-scroll"><table><thead><tr><th>Order</th><th>Customer</th><th>Payment</th><th>Total</th><th>Status</th><th>Items</th></tr></thead><tbody>{rows.map((order) => <tr key={order.id}><td>{order.order_number}</td><td>{order.customer?.full_name || order.contact_email}</td><td>{titleCase(order.payment_status)}</td><td>{formatMMK(order.grand_total)}</td><td><select className="order-status-select" value={order.status} onChange={(e) => void act({ action: "set_order_status", orderId: order.id, status: e.target.value })}>{order.status === "pending_payment" && <option value="pending_payment" disabled>Awaiting payment</option>}{orderStatuses.map((status) => <option key={status}>{status}</option>)}</select></td><td><button className="table-icon-button" aria-label={`View ${order.order_number}`} onClick={() => setSelected(order)}><Eye /></button></td></tr>)}</tbody></table></div></section>{selected && <OrderDetail order={selected} close={() => setSelected(null)}/>}</div>;
}
function OrderDetail({ order, close }: { order: Order; close: () => void }) { return <section className="order-detail-card"><header><div><p className="eyebrow dark">Order detail</p><h2>{order.order_number}</h2></div><button aria-label="Close order details" onClick={close}><X /></button></header><div className="order-customer-grid"><div><span>Customer</span><strong>{order.customer?.full_name || "Maison client"}</strong><p>{order.contact_email}<br/>{order.contact_phone}</p></div><div><span>Delivery</span><strong>{titleCase(order.delivery_method)}</strong><p>{Object.values(order.delivery_address ?? {}).filter(Boolean).join(", ")}</p></div><div><span>Status</span><strong>{titleCase(order.status)}</strong><p>{titleCase(order.payment_status)}</p></div></div><div className="order-item-list">{order.items.map((item) => <article key={item.id}>{item.primary_image_url ? <div><Image src={item.primary_image_url} alt="" fill sizes="64px"/></div> : <div className="missing-thumb"><ImageIcon /></div>}<span><strong>{item.product_name}</strong><small>{Object.values(item.variant_snapshot ?? {}).join(" · ") || item.sku}</small><small>{item.quantity} × {formatMMK(item.unit_price)}</small></span><strong>{formatMMK(item.line_total)}</strong></article>)}</div><dl className="order-totals"><div><dt>Subtotal</dt><dd>{formatMMK(order.subtotal)}</dd></div><div><dt>Delivery</dt><dd>{formatMMK(order.delivery_fee)}</dd></div><div><dt>Discount</dt><dd>- {formatMMK(Number(order.discount) + Number(order.loyalty_discount))}</dd></div><div><dt>Total</dt><dd>{formatMMK(order.grand_total)}</dd></div></dl></section>; }

function Payments({ rows, orders, customers, act }: { rows: Payment[]; orders: Order[]; customers: Customer[]; act: (p: Dict) => Promise<boolean> }) { const orderMap = new Map(orders.map((o) => [o.id, o])); const customerMap = new Map(customers.map((c) => [c.id, c])); return <div className="payment-review-grid">{rows.map((payment) => { const order = orderMap.get(payment.order_id); const customer = customerMap.get(payment.user_id); return <article className="payment-review" key={payment.id}><header><div><p className="eyebrow dark">{order?.order_number ?? "Payment"}</p><h2>{formatMMK(payment.amount)}</h2></div><span className={`status-chip ${payment.status}`}>{titleCase(payment.status)}</span></header><div className="admin-proof">{payment.proofSignedUrl ? <Image src={payment.proofSignedUrl} alt={`Payment proof for ${order?.order_number ?? payment.id}`} fill sizes="420px" unoptimized/> : <div><ImageIcon /><p>No screenshot submitted.</p></div>}</div><p>{customer?.full_name || order?.contact_email || "Customer"}<br/><small>{payment.submitted_at ? new Date(payment.submitted_at).toLocaleString() : "Awaiting submission"}</small></p>{payment.rejection_reason && <p className="payment-reason">{payment.rejection_reason}</p>}{payment.status === "payment_submitted" && <div className="payment-actions"><button onClick={() => void act({ action: "verify_payment", paymentId: payment.id })}><Save />Verify</button><button onClick={() => void act({ action: "reject_payment", paymentId: payment.id, reason: "Payment proof could not be verified." })}><X />Reject</button></div>}</article>; })}</div>; }

function Catalog({ data, editing, setEditing, act }: { data: AdminData; editing: Product | null; setEditing: (p: Product | null) => void; act: (p: Dict) => Promise<boolean> }) { const exportRows = productsForExport(data.products); return <div className="catalog-admin-grid"><ProductForm key={editing?.id ?? "new"} product={editing} departments={data.departments} categories={data.categories} cancel={() => setEditing(null)} act={act}/><section className="admin-table-card"><Heading eyebrow="Live catalog" title="Products" action={<div className="admin-heading-actions"><ExportButtons rows={exportRows} columns={productExportColumns} fileBase="veloire-products" sheetName="Products"/><button onClick={() => setEditing(null)}><Plus />New product</button></div>}/><div className="catalog-list">{data.products.map((product) => <article key={product.id}><div className="catalog-thumb"><Image src={product.primary_image_url} alt="" fill sizes="62px"/></div><span><strong>{product.name}</strong><small>{product.variants[0]?.sku ?? "No variant"} · {formatMMK(product.base_price)}</small></span><i>{product.is_available ? "Active" : "Hidden"}</i><button aria-label={`Edit ${product.name}`} onClick={() => setEditing(product)}><Edit3 /></button><button aria-label={`Delete ${product.name}`} onClick={() => window.confirm(`Delete ${product.name}? Historical receipt snapshots will remain.`) && void act({ action: "delete_product", productId: product.id })}><Trash2 /></button></article>)}</div></section><Categories departments={data.departments} rows={data.categories} act={act}/></div>; }

async function uploadProductImage(file: File) {
  const { data: auth } = await getSupabaseBrowser().auth.getSession();
  if (!auth.session) throw new Error("Your admin session has expired. Please sign in again.");
  const body = new FormData();
  body.set("file", file);
  const response = await fetch("/api/admin/product-media", {
    method: "POST",
    headers: { Authorization: `Bearer ${auth.session.access_token}` },
    body,
  });
  const result = await response.json().catch(() => ({})) as { url?: string; error?: string };
  if (!response.ok || !result.url) throw new Error(result.error ?? "The product image could not be uploaded.");
  return result.url;
}

function ProductForm({ product, departments, categories, cancel, act }: { product: Product | null; departments: Department[]; categories: Category[]; cancel: () => void; act: (p: Dict) => Promise<boolean> }) {
  const variant = product?.variants[0];
  const [primaryFile, setPrimaryFile] = useState<File | null>(null);
  const [hoverFile, setHoverFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState("");

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setUploading(true);
    setFormError("");

    try {
      const primaryImageUrl = primaryFile ? await uploadProductImage(primaryFile) : String(fields.get("primaryImageUrl") ?? "").trim();
      const hoverImageUrl = hoverFile ? await uploadProductImage(hoverFile) : String(fields.get("hoverImageUrl") ?? "").trim();
      if (!primaryImageUrl) throw new Error("Upload a primary product image or enter its URL.");

      const payload = {
        action: product ? "update_product" : "create_product",
        ...(product ? { productId: product.id } : {}),
        product: {
          name: String(fields.get("name")),
          slug: String(fields.get("slug")),
          description: String(fields.get("description")),
          productType: String(fields.get("productType")),
          basePrice: Number(fields.get("basePrice")),
          material: String(fields.get("material") ?? "").trim() || null,
          care: String(fields.get("care") ?? "").trim() || null,
          shippingNote: String(fields.get("shippingNote") ?? "").trim() || null,
          returnPolicy: String(fields.get("returnPolicy") ?? "").trim() || null,
          primaryImageUrl,
          hoverImageUrl: hoverImageUrl || null,
          videoUrl: String(fields.get("videoUrl") ?? "").trim() || null,
          departmentId: Number(fields.get("departmentId")),
          categoryId: Number(fields.get("categoryId")) || null,
          isAvailable: fields.get("isAvailable") === "on",
          isFeatured: fields.get("isFeatured") === "on",
          isNewArrival: fields.get("isNewArrival") === "on",
        },
        variant: {
          ...(variant?.id ? { id: variant.id } : {}),
          sku: String(fields.get("sku")),
          optionValues: { [String(fields.get("optionName") || "Edition")]: String(fields.get("optionValue") || "Standard") },
          priceAdjustment: Number(fields.get("priceAdjustment")),
          stock: Number(fields.get("stock")),
          lowStockThreshold: Number(fields.get("lowStockThreshold")),
          isActive: true,
        },
      };

      if (!(await act(payload))) return;
      if (product) {
        cancel();
      } else {
        form.reset();
        setPrimaryFile(null);
        setHoverFile(null);
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "The product could not be saved.");
    } finally {
      setUploading(false);
    }
  };

  return <section className="catalog-form-card">
    <Heading eyebrow="Catalog editor" title={product ? "Edit product" : "Add product"} action={product ? <button onClick={cancel}><X />Cancel</button> : undefined}/>
    <form onSubmit={submit}>
      <label>Name<input name="name" required defaultValue={product?.name}/></label>
      <label>Slug<input name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required defaultValue={product?.slug}/></label>
      <label>Description<textarea name="description" rows={3} required defaultValue={product?.description}/></label>
      <div className="admin-form-row"><label>Product type<input name="productType" required defaultValue={product?.product_type}/></label><label>Base price<input name="basePrice" type="number" min="0" required defaultValue={product?.base_price}/></label></div>
      <div className="admin-form-row"><label>Material<textarea name="material" rows={2} defaultValue={product?.material ?? ""}/></label><label>Care<textarea name="care" rows={2} defaultValue={product?.care ?? ""}/></label></div>
      <div className="admin-form-row"><label>Shipping note<textarea name="shippingNote" rows={2} defaultValue={product?.shipping_note ?? ""}/></label><label>Return policy<textarea name="returnPolicy" rows={2} defaultValue={product?.return_policy ?? ""}/></label></div>
      <label>Primary image URL<input name="primaryImageUrl" placeholder="Paste a URL or upload below" defaultValue={product?.primary_image_url}/></label>
      <label className="admin-file-field"><span><Upload />Primary image file</span><input name="primaryImageFile" type="file" accept=".jpg,.jpeg,.png,.webp,.gif,.avif,image/jpeg,image/png,image/webp,image/gif,image/avif" onChange={(event) => setPrimaryFile(event.target.files?.[0] ?? null)}/><small>{primaryFile?.name ?? "JPG, JPEG, PNG, WEBP, GIF or AVIF · maximum 4 MB"}</small></label>
      <label>Hover image URL<input name="hoverImageUrl" placeholder="Optional URL or upload below" defaultValue={product?.hover_image_url ?? ""}/></label>
      <label className="admin-file-field"><span><Upload />Hover image file</span><input name="hoverImageFile" type="file" accept=".jpg,.jpeg,.png,.webp,.gif,.avif,image/jpeg,image/png,image/webp,image/gif,image/avif" onChange={(event) => setHoverFile(event.target.files?.[0] ?? null)}/><small>{hoverFile?.name ?? "Optional secondary product image"}</small></label>
      <label>Product video URL<input name="videoUrl" placeholder="Optional MP4 or hosted video URL" defaultValue={product?.video_url ?? ""}/></label>
      <div className="admin-form-row"><label>Department<select name="departmentId" defaultValue={product?.department_id}>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label><label>Category<select name="categoryId" defaultValue={product?.category_id ?? ""}><option value="">No category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label></div>
      <div className="admin-form-row"><label>SKU<input name="sku" required defaultValue={variant?.sku}/></label><label>Stock<input name="stock" type="number" min="0" required defaultValue={variant?.stock}/></label></div>
      <div className="admin-form-row"><label>Option name<input name="optionName" placeholder="Edition" defaultValue={variant ? Object.keys(variant.option_values)[0] : undefined}/></label><label>Option value<input name="optionValue" placeholder="Standard" defaultValue={variant ? Object.values(variant.option_values)[0] : undefined}/></label></div>
      <div className="admin-form-row"><label>Price adjustment<input name="priceAdjustment" type="number" defaultValue={variant?.price_adjustment}/></label><label>Low stock alert<input name="lowStockThreshold" type="number" min="0" defaultValue={variant?.low_stock_threshold}/></label></div>
      <div className="admin-checks"><label><input type="checkbox" name="isAvailable" defaultChecked={product?.is_available ?? true}/>Available</label><label><input type="checkbox" name="isFeatured" defaultChecked={product?.is_featured ?? false}/>Featured</label><label><input type="checkbox" name="isNewArrival" defaultChecked={product?.is_new_arrival ?? true}/>New arrival</label></div>
      {formError && <p className="admin-form-error" role="alert">{formError}</p>}
      <button className="admin-primary" disabled={uploading}><Save />{uploading ? "Uploading images…" : product ? "Save product" : "Create product"}</button>
    </form>
  </section>;
}

function Categories({ departments, rows, act }: { departments: Department[]; rows: Category[]; act: (p: Dict) => Promise<boolean> }) { const [editing, setEditing] = useState<Category | null>(null); const submit = async (e: React.FormEvent<HTMLFormElement>) => { e.preventDefault(); const form = e.currentTarget; const f = new FormData(form); if (await act({ action: "upsert_category", ...(editing ? { id: editing.id } : {}), departmentId: Number(f.get("departmentId")), name: String(f.get("name")), slug: String(f.get("slug")), sortOrder: Number(f.get("sortOrder")), active: f.get("active") === "on" })) { form.reset(); setEditing(null); } }; return <section className="category-manager"><Heading eyebrow="Navigation taxonomy" title="Categories"/><form key={editing?.id ?? "new"} onSubmit={submit}><select name="departmentId" defaultValue={editing?.department_id}>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select><input name="name" placeholder="Category name" required defaultValue={editing?.name}/><input name="slug" placeholder="category-slug" required defaultValue={editing?.slug}/><input name="sortOrder" type="number" min="0" defaultValue={editing?.sort_order}/><label><input name="active" type="checkbox" defaultChecked={editing?.is_active ?? true}/>Active</label><button><Save />{editing ? "Save" : "Add"}</button></form><div className="category-list">{rows.map((c) => <article key={c.id}><span><strong>{c.name}</strong><small>{c.slug}</small></span><button aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)}><Edit3 /></button><button aria-label={`Delete ${c.name}`} onClick={() => window.confirm(`Delete ${c.name}?`) && void act({ action: "delete_category", categoryId: c.id })}><Trash2 /></button></article>)}</div></section>; }

function Customers({ rows, act }: { rows: Customer[]; act: (p: Dict) => Promise<boolean> }) { const exportRows = customersForExport(rows); return <section className="admin-table-card"><Heading eyebrow="Account access" title="Customers" action={<ExportButtons rows={exportRows} columns={customerExportColumns} fileBase="veloire-customers" sheetName="Customers"/>}/><div className="table-scroll"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Points</th><th>Last sign in</th><th>Access</th></tr></thead><tbody>{rows.map((c) => <tr key={c.id}><td>{c.full_name || "Maison client"}</td><td>{c.email}</td><td>{titleCase(c.role)}</td><td>{c.loyalty_points}</td><td>{c.last_sign_in_at ? new Date(c.last_sign_in_at).toLocaleDateString() : "Never"}</td><td>{c.role === "admin" ? <span className="status-chip verified">Protected</span> : <button className={c.disabled ? "user-enable" : "user-disable"} onClick={() => void act({ action: "set_user_disabled", userId: c.id, disabled: !c.disabled })}>{c.disabled ? "Enable" : "Disable"}</button>}</td></tr>)}</tbody></table></div></section>; }

function Returns({ rows, orders, act }: { rows: ReturnRow[]; orders: Order[]; act: (p: Dict) => Promise<boolean> }) { const map = new Map(orders.map((o) => [o.id, o.order_number])); const exportRows = returnsForExport(rows, orders); return <section className="admin-table-card"><Heading eyebrow="Aftercare" title="Returns" action={<ExportButtons rows={exportRows} columns={returnExportColumns} fileBase="veloire-returns" sheetName="Returns"/>}/><div className="table-scroll"><table><thead><tr><th>Order</th><th>Reason</th><th>Requested</th><th>Status</th></tr></thead><tbody>{rows.length ? rows.map((r) => <tr key={r.id}><td>{map.get(r.order_id) ?? r.order_id.slice(0, 8)}</td><td>{r.reason}</td><td>{new Date(r.requested_at).toLocaleDateString()}</td><td><select className="order-status-select" value={r.status} onChange={(e) => void act({ action: "set_return_status", returnId: r.id, status: e.target.value })}>{returnStatuses.map((s) => <option key={s}>{s}</option>)}</select></td></tr>) : <tr><td colSpan={4}>No return requests.</td></tr>}</tbody></table></div></section>; }

function AI({ settings, act }: { settings: { enabled: boolean; updated_at?: string }; act: (p: Dict) => Promise<boolean> }) { return <section className="ai-status-card"><Sparkles/><p className="eyebrow dark">Private stylist service</p><h2>AI is <em>{settings.enabled ? "enabled" : "disabled"}</em></h2><p>Turning the service off immediately stops new styling requests while preserving the storefront and order flows.</p><div><span className={`status-dot${settings.enabled ? "" : " off"}`}/>{settings.enabled ? "Operational" : "Unavailable to customers"}</div><button className="ai-toggle" onClick={() => void act({ action: "set_ai_enabled", enabled: !settings.enabled })}>{settings.enabled ? "Disable AI service" : "Enable AI service"}</button>{settings.updated_at && <small>Last changed {new Date(settings.updated_at).toLocaleString()}</small>}</section>; }

function ExportButtons({ rows, columns, fileBase, sheetName }: { rows: ExportRecord[]; columns: AdminExportColumn<ExportRecord>[]; fileBase: string; sheetName: string }) {
  const [exporting, setExporting] = useState<"csv" | "xlsx" | null>(null);
  const [status, setStatus] = useState("");
  const run = async (format: "csv" | "xlsx") => {
    setExporting(format);
    setStatus("");
    try {
      await exportAdminRows({ rows, columns, fileBase, sheetName, format });
      setStatus(`${format === "xlsx" ? "Excel" : "CSV"} export ready.`);
    } catch (error) {
      console.error("Admin export failed", error);
      setStatus("Export failed. Please try again.");
    } finally {
      setExporting(null);
    }
  };
  return <div className="admin-export-actions">
    <span>{rows.length} rows</span>
    <button type="button" disabled={!rows.length || exporting !== null} onClick={() => void run("csv")} aria-label={`Export ${sheetName} as CSV`}><Download />{exporting === "csv" ? "Preparing" : "CSV"}</button>
    <button type="button" disabled={!rows.length || exporting !== null} onClick={() => void run("xlsx")} aria-label={`Export ${sheetName} as Excel`}><FileSpreadsheet />{exporting === "xlsx" ? "Preparing" : "Excel"}</button>
    <span className="admin-export-status" role="status" aria-live="polite">{status}</span>
  </div>;
}

function Heading({ eyebrow, title, meta, action }: { eyebrow: string; title: string; meta?: string; action?: React.ReactNode }) { return <div className="admin-table-head"><div><p className="eyebrow dark">{eyebrow}</p><h2>{title}</h2></div>{action ?? (meta ? <span>{meta}</span> : null)}</div>; }
