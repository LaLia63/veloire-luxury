import { z } from "zod";
import { getServiceClient } from "@/lib/supabase-server";

async function adminFor(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return null;
  const { data: profile } = await service.from("vlr_profiles").select("id,role,email").eq("id", user.id).maybeSingle();
  return profile?.role === "admin" ? { service, user } : null;
}

export async function GET(request: Request) {
  const admin = await adminFor(request);
  if (!admin) return Response.json({ error: "Admin access required" }, { status: 403 });
  const { service } = admin;
  const [products, orders, payments, returns, profiles, lowStock] = await Promise.all([
    service.from("vlr_products").select("id,name,slug,base_price,is_available,is_featured,is_new_arrival,department:vlr_departments(name),category:vlr_categories(name)").order("created_at", { ascending: false }),
    service.from("vlr_orders").select("id,order_number,status,payment_status,grand_total,created_at,user_id").order("created_at", { ascending: false }).limit(100),
    service.from("vlr_payments").select("id,order_id,user_id,amount,status,proof_path,submitted_at,created_at").order("created_at", { ascending: false }).limit(100),
    service.from("vlr_returns").select("id,order_id,user_id,status,reason,requested_at").order("requested_at", { ascending: false }).limit(100),
    service.from("vlr_profiles").select("id,email,full_name,role,loyalty_points,created_at").order("created_at", { ascending: false }).limit(100),
    service.from("vlr_product_variants").select("id,sku,stock,low_stock_threshold,product:vlr_products(name)").lte("stock", 3).order("stock"),
  ]);
  const verifiedRevenue = (orders.data ?? []).filter((order) => order.payment_status === "verified").reduce((sum, order) => sum + Number(order.grand_total), 0);
  return Response.json({ summary: { revenue: verifiedRevenue, orders: orders.data?.length ?? 0, customers: profiles.data?.filter((profile) => profile.role === "customer").length ?? 0, pendingPayments: payments.data?.filter((payment) => payment.status === "payment_submitted").length ?? 0, returns: returns.data?.filter((item) => !["rejected","refunded"].includes(item.status)).length ?? 0 }, products: products.data ?? [], orders: orders.data ?? [], payments: payments.data ?? [], returns: returns.data ?? [], customers: profiles.data ?? [], lowStock: lowStock.data ?? [] });
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("verify_payment"), paymentId: z.string().uuid() }),
  z.object({ action: z.literal("reject_payment"), paymentId: z.string().uuid(), reason: z.string().min(2).max(300) }),
  z.object({ action: z.literal("toggle_product"), productId: z.string().uuid(), available: z.boolean() }),
  z.object({ action: z.literal("archive_product"), productId: z.string().uuid() }),
  z.object({ action: z.literal("upsert_category"), id: z.number().int().optional(), departmentId: z.number().int(), name: z.string().min(2).max(80), slug: z.string().regex(/^[a-z0-9-]+$/), sortOrder: z.number().int().min(0), active: z.boolean() }),
]);

export async function POST(request: Request) {
  const admin = await adminFor(request);
  if (!admin) return Response.json({ error: "Admin access required" }, { status: 403 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid admin action" }, { status: 400 });
  const { service, user } = admin; const input = parsed.data;
  let entityId = "";
  if (input.action === "verify_payment") {
    const { data, error } = await service.from("vlr_payments").update({ status: "verified", verified_at: new Date().toISOString(), verified_by: user.id }).eq("id", input.paymentId).eq("status", "payment_submitted").select("id").maybeSingle();
    if (error || !data) return Response.json({ error: "Payment is not awaiting verification or was already handled." }, { status: 409 }); entityId = input.paymentId;
  } else if (input.action === "reject_payment") {
    const { data } = await service.from("vlr_payments").update({ status: "rejected", rejection_reason: input.reason, verified_by: user.id }).eq("id", input.paymentId).eq("status", "payment_submitted").select("id").maybeSingle();
    if (!data) return Response.json({ error: "Payment is not awaiting review." }, { status: 409 }); entityId = input.paymentId;
  } else if (input.action === "toggle_product" || input.action === "archive_product") {
    entityId = input.productId; await service.from("vlr_products").update({ is_available: input.action === "toggle_product" ? input.available : false }).eq("id", input.productId);
  } else if (input.action === "upsert_category") {
    const row = { department_id: input.departmentId, name: input.name, slug: input.slug, sort_order: input.sortOrder, is_active: input.active };
    const { data } = input.id ? await service.from("vlr_categories").update(row).eq("id", input.id).select("id").single() : await service.from("vlr_categories").insert(row).select("id").single(); entityId = String(data?.id ?? input.id ?? "");
  }
  await service.from("vlr_admin_audit_logs").insert({ actor_id: user.id, action: input.action, entity_type: input.action.includes("payment") ? "payment" : input.action.includes("category") ? "category" : "product", entity_id: entityId });
  return Response.json({ ok: true });
}
