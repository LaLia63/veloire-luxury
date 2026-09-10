import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getServiceClient } from "@/lib/supabase-server";

const ORDER_STATUSES = ["confirmed", "preparing", "quality_inspection", "luxury_packaging", "shipped", "delivered", "cancelled", "return_in_progress", "refunded"] as const;
const RETURN_STATUSES = ["requested", "under_review", "approved", "rejected", "item_received", "inspection", "refund_approved", "refunded"] as const;

async function adminFor(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return null;
  const { data: profile } = await service.from("vlr_profiles").select("id,role,email").eq("id", user.id).maybeSingle();
  return profile?.role === "admin" ? { service, user } : null;
}

function countBy<T>(rows: T[], value: (row: T) => string) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(value(row), (counts.get(value(row)) ?? 0) + 1);
  return [...counts].map(([label, amount]) => ({ label, value: amount }));
}

export async function GET(request: Request) {
  const admin = await adminFor(request);
  if (!admin) return Response.json({ error: "Admin access required" }, { status: 403 });
  const { service } = admin;
  const [products, orders, payments, returns, profiles, lowStock, departments, categories, aiSettings, adminNotifications, authUsers] = await Promise.all([
    service.from("vlr_products").select("id,name,slug,description,product_type,base_price,material,care,shipping_note,return_policy,primary_image_url,hover_image_url,video_url,department_id,category_id,is_available,is_featured,is_new_arrival,created_at,variants:vlr_product_variants(id,sku,option_values,price_adjustment,stock,low_stock_threshold,is_active),department:vlr_departments(id,name),category:vlr_categories(id,name)").order("created_at", { ascending: false }),
    service.from("vlr_orders").select("id,order_number,user_id,status,payment_status,contact_email,contact_phone,delivery_address,delivery_method,subtotal,discount,loyalty_discount,delivery_fee,grand_total,loyalty_points_earned,loyalty_points_redeemed,delivered_at,created_at,updated_at,items:vlr_order_items(id,product_name,variant_snapshot,sku,unit_price,quantity,line_total,primary_image_url)").order("created_at", { ascending: false }).limit(200),
    service.from("vlr_payments").select("id,order_id,user_id,provider,amount,status,proof_path,submitted_at,verified_at,rejection_reason,created_at").order("created_at", { ascending: false }).limit(200),
    service.from("vlr_returns").select("id,order_id,user_id,status,reason,photo_paths,admin_note,requested_at,updated_at").order("requested_at", { ascending: false }).limit(200),
    service.from("vlr_profiles").select("id,email,full_name,role,loyalty_points,is_active,disabled_at,disabled_reason,created_at").order("created_at", { ascending: false }).limit(500),
    service.from("vlr_product_variants").select("id,sku,stock,low_stock_threshold,product:vlr_products(id,name)").lte("stock", 3).order("stock"),
    service.from("vlr_departments").select("id,name,slug,is_active,sort_order").order("sort_order"),
    service.from("vlr_categories").select("id,department_id,name,slug,is_active,sort_order").order("sort_order"),
    service.from("vlr_ai_settings").select("enabled,system_note,updated_at").eq("id", true).maybeSingle(),
    service.from("vlr_notifications").select("id,order_id,type,title,message,is_read,created_at").eq("audience", "admin").order("created_at", { ascending: false }).limit(50),
    service.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  const failed = [products.error, orders.error, payments.error, returns.error, profiles.error, departments.error, categories.error, aiSettings.error, adminNotifications.error].find(Boolean);
  if (failed) return Response.json({ error: "Admin data could not be loaded." }, { status: 500 });

  const profileRows = profiles.data ?? [];
  const profileById = new Map(profileRows.map((profile) => [profile.id, profile]));
  const authById = new Map((authUsers.data?.users ?? []).map((authUser) => [authUser.id, authUser]));
  const now = Date.now();
  const customers = profileRows.map((profile) => {
    const authUser = authById.get(profile.id);
    const authBanned = authUser?.banned_until ? new Date(authUser.banned_until).getTime() > now : false;
    return { ...profile, disabled: profile.is_active === false || authBanned, last_sign_in_at: authUser?.last_sign_in_at ?? null };
  });
  const orderRows = (orders.data ?? []).map((order) => ({ ...order, customer: profileById.get(order.user_id) ?? null }));
  const paymentRows = await Promise.all((payments.data ?? []).map(async (payment) => {
    if (!payment.proof_path) return { ...payment, proofSignedUrl: null };
    const { data } = await service.storage.from("vlr-payment-proofs").createSignedUrl(payment.proof_path, 600);
    return { ...payment, proofSignedUrl: data?.signedUrl ?? null };
  }));
  const verifiedRevenue = orderRows.filter((order) => order.payment_status === "verified").reduce((sum, order) => sum + Number(order.grand_total), 0);
  const revenueDays = new Map<string, { date: string; revenue: number; orders: number }>();
  for (let offset = 13; offset >= 0; offset--) {
    const day = new Date(); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() - offset);
    const key = day.toISOString().slice(0, 10); revenueDays.set(key, { date: key, revenue: 0, orders: 0 });
  }
  for (const order of orderRows) {
    const day = revenueDays.get(new Date(order.created_at).toISOString().slice(0, 10));
    if (day) { day.orders += 1; if (order.payment_status === "verified") day.revenue += Number(order.grand_total); }
  }

  return Response.json({
    summary: { revenue: verifiedRevenue, orders: orderRows.length, customers: customers.filter((profile) => profile.role === "customer").length, pendingPayments: paymentRows.filter((payment) => payment.status === "payment_submitted").length, returns: (returns.data ?? []).filter((item) => !["rejected", "refunded"].includes(item.status)).length, activeProducts: (products.data ?? []).filter((product) => product.is_available).length },
    analytics: { revenueByDay: [...revenueDays.values()], ordersByStatus: countBy(orderRows, (order) => order.status), paymentsByStatus: countBy(paymentRows, (payment) => payment.status) },
    products: products.data ?? [], orders: orderRows, payments: paymentRows, returns: returns.data ?? [], customers,
    departments: departments.data ?? [], categories: categories.data ?? [], aiSettings: aiSettings.data ?? { enabled: true },
    adminNotifications: adminNotifications.data ?? [], lowStock: lowStock.data ?? [],
  });
}

const productSchema = z.object({
  name: z.string().trim().min(2).max(140), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), description: z.string().trim().min(2).max(4000),
  productType: z.string().trim().min(2).max(80), basePrice: z.number().nonnegative(), material: z.string().trim().max(1000).nullable(), care: z.string().trim().max(1000).nullable(),
  shippingNote: z.string().trim().max(1000).nullable(), returnPolicy: z.string().trim().max(1000).nullable(), primaryImageUrl: z.string().trim().min(1).max(1000),
  hoverImageUrl: z.string().trim().max(1000).nullable(), videoUrl: z.string().trim().max(1000).nullable(),
  departmentId: z.number().int().positive(), categoryId: z.number().int().positive().nullable(), isAvailable: z.boolean(), isFeatured: z.boolean(), isNewArrival: z.boolean(),
});
const variantSchema = z.object({
  id: z.string().uuid().optional(), sku: z.string().trim().min(2).max(80), optionValues: z.record(z.string(), z.string()), priceAdjustment: z.number(), stock: z.number().int().min(0), lowStockThreshold: z.number().int().min(0), isActive: z.boolean(),
});

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("verify_payment"), paymentId: z.string().uuid() }),
  z.object({ action: z.literal("reject_payment"), paymentId: z.string().uuid(), reason: z.string().min(2).max(300) }),
  z.object({ action: z.literal("set_order_status"), orderId: z.string().uuid(), status: z.enum(ORDER_STATUSES) }),
  z.object({ action: z.literal("create_product"), product: productSchema, variant: variantSchema }),
  z.object({ action: z.literal("update_product"), productId: z.string().uuid(), product: productSchema, variant: variantSchema }),
  z.object({ action: z.literal("delete_product"), productId: z.string().uuid() }),
  z.object({ action: z.literal("toggle_product"), productId: z.string().uuid(), available: z.boolean() }),
  z.object({ action: z.literal("archive_product"), productId: z.string().uuid() }),
  z.object({ action: z.literal("upsert_category"), id: z.number().int().optional(), departmentId: z.number().int(), name: z.string().min(2).max(80), slug: z.string().regex(/^[a-z0-9-]+$/), sortOrder: z.number().int().min(0), active: z.boolean() }),
  z.object({ action: z.literal("delete_category"), categoryId: z.number().int().positive() }),
  z.object({ action: z.literal("set_user_disabled"), userId: z.string().uuid(), disabled: z.boolean(), reason: z.string().max(300).optional() }),
  z.object({ action: z.literal("set_ai_enabled"), enabled: z.boolean() }),
  z.object({ action: z.literal("set_return_status"), returnId: z.string().uuid(), status: z.enum(RETURN_STATUSES), adminNote: z.string().max(500).optional() }),
  z.object({ action: z.literal("mark_admin_notifications_read") }),
]);

function productRow(product: z.infer<typeof productSchema>) {
  return {
    name: product.name,
    slug: product.slug,
    description: product.description,
    product_type: product.productType,
    base_price: product.basePrice,
    material: product.material,
    care: product.care,
    shipping_note: product.shippingNote,
    return_policy: product.returnPolicy,
    primary_image_url: product.primaryImageUrl,
    hover_image_url: product.hoverImageUrl,
    video_url: product.videoUrl,
    department_id: product.departmentId,
    category_id: product.categoryId,
    is_available: product.isAvailable,
    is_featured: product.isFeatured,
    is_new_arrival: product.isNewArrival,
  };
}
function variantRow(variant: z.infer<typeof variantSchema>, productId: string) {
  return { product_id: productId, sku: variant.sku, option_values: variant.optionValues, price_adjustment: variant.priceAdjustment, stock: variant.stock, low_stock_threshold: variant.lowStockThreshold, is_active: variant.isActive };
}

export async function POST(request: Request) {
  const admin = await adminFor(request);
  if (!admin) return Response.json({ error: "Admin access required" }, { status: 403 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid admin action", details: parsed.error.flatten() }, { status: 400 });
  const { service, user } = admin; const input = parsed.data;
  let entityId = ""; let entityType = "admin";

  if (input.action === "verify_payment") {
    const { data, error } = await service.from("vlr_payments").update({ status: "verified", verified_at: new Date().toISOString(), verified_by: user.id }).eq("id", input.paymentId).eq("status", "payment_submitted").select("id").maybeSingle();
    if (error || !data) return Response.json({ error: "Payment is not awaiting verification or was already handled." }, { status: 409 }); entityId = input.paymentId; entityType = "payment";
  } else if (input.action === "reject_payment") {
    const { data, error } = await service.from("vlr_payments").update({ status: "rejected", rejection_reason: input.reason, verified_by: user.id }).eq("id", input.paymentId).eq("status", "payment_submitted").select("id").maybeSingle();
    if (error || !data) return Response.json({ error: "Payment is not awaiting review." }, { status: 409 }); entityId = input.paymentId; entityType = "payment";
  } else if (input.action === "set_order_status") {
    const { data: current } = await service.from("vlr_orders").select("id,status,payment_status").eq("id", input.orderId).maybeSingle();
    if (!current) return Response.json({ error: "Order not found." }, { status: 404 });
    if (input.status !== "cancelled" && current.payment_status !== "verified") return Response.json({ error: "Verify the payment before advancing this order." }, { status: 409 });
    const update: { status: typeof input.status; delivered_at?: string | null } = { status: input.status };
    if (input.status === "delivered") update.delivered_at = new Date().toISOString(); else if (current.status === "delivered") update.delivered_at = null;
    const { error } = await service.from("vlr_orders").update(update).eq("id", input.orderId); if (error) return Response.json({ error: "Order status could not be updated." }, { status: 409 }); entityId = input.orderId; entityType = "order";
  } else if (input.action === "create_product") {
    const { data: product, error } = await service.from("vlr_products").insert(productRow(input.product)).select("id").single();
    if (error || !product) return Response.json({ error: error?.message ?? "Product could not be created." }, { status: 409 });
    const { error: variantError } = await service.from("vlr_product_variants").insert(variantRow(input.variant, product.id));
    if (variantError) { await service.from("vlr_products").delete().eq("id", product.id); return Response.json({ error: variantError.message }, { status: 409 }); }
    entityId = product.id; entityType = "product";
  } else if (input.action === "update_product") {
    const { error } = await service.from("vlr_products").update(productRow(input.product)).eq("id", input.productId); if (error) return Response.json({ error: error.message }, { status: 409 });
    const variantResult = input.variant.id ? await service.from("vlr_product_variants").update(variantRow(input.variant, input.productId)).eq("id", input.variant.id).eq("product_id", input.productId) : await service.from("vlr_product_variants").insert(variantRow(input.variant, input.productId));
    if (variantResult.error) return Response.json({ error: variantResult.error.message }, { status: 409 }); entityId = input.productId; entityType = "product";
  } else if (input.action === "delete_product") {
    const { data, error } = await service.from("vlr_products").delete().eq("id", input.productId).select("id").maybeSingle(); if (error || !data) return Response.json({ error: error?.message ?? "Product not found." }, { status: 409 }); entityId = input.productId; entityType = "product";
  } else if (input.action === "toggle_product" || input.action === "archive_product") {
    const { error } = await service.from("vlr_products").update({ is_available: input.action === "toggle_product" ? input.available : false }).eq("id", input.productId); if (error) return Response.json({ error: error.message }, { status: 409 }); entityId = input.productId; entityType = "product";
  } else if (input.action === "upsert_category") {
    const row = { department_id: input.departmentId, name: input.name, slug: input.slug, sort_order: input.sortOrder, is_active: input.active };
    const result = input.id ? await service.from("vlr_categories").update(row).eq("id", input.id).select("id").single() : await service.from("vlr_categories").insert(row).select("id").single(); if (result.error) return Response.json({ error: result.error.message }, { status: 409 }); entityId = String(result.data.id); entityType = "category";
  } else if (input.action === "delete_category") {
    const { data, error } = await service.from("vlr_categories").delete().eq("id", input.categoryId).select("id").maybeSingle(); if (error || !data) return Response.json({ error: error?.message ?? "Category not found." }, { status: 409 }); entityId = String(input.categoryId); entityType = "category";
  } else if (input.action === "set_user_disabled") {
    const { data: target } = await service.from("vlr_profiles").select("id,role,is_active").eq("id", input.userId).maybeSingle(); if (!target) return Response.json({ error: "Customer not found." }, { status: 404 }); if (target.role === "admin") return Response.json({ error: "Admin accounts cannot be disabled here." }, { status: 409 });
    const profileUpdate = input.disabled ? { is_active: false, disabled_at: new Date().toISOString(), disabled_reason: input.reason || "Disabled by administrator" } : { is_active: true, disabled_at: null, disabled_reason: null };
    const { error: profileError } = await service.from("vlr_profiles").update(profileUpdate).eq("id", input.userId); if (profileError) return Response.json({ error: "Customer status could not be updated." }, { status: 409 });
    const { error: authError } = await service.auth.admin.updateUserById(input.userId, { ban_duration: input.disabled ? "876000h" : "none" });
    if (authError) { await service.from("vlr_profiles").update({ is_active: target.is_active, disabled_at: target.is_active ? null : new Date().toISOString() }).eq("id", input.userId); return Response.json({ error: "Auth access could not be updated." }, { status: 409 }); }
    entityId = input.userId; entityType = "user";
  } else if (input.action === "set_ai_enabled") {
    const { error } = await service.from("vlr_ai_settings").update({ enabled: input.enabled, updated_by: user.id }).eq("id", true); if (error) return Response.json({ error: "AI setting could not be updated." }, { status: 409 }); entityId = "global"; entityType = "ai_setting";
  } else if (input.action === "set_return_status") {
    const { data, error } = await service.from("vlr_returns").update({ status: input.status, admin_note: input.adminNote ?? null }).eq("id", input.returnId).select("id").maybeSingle(); if (error || !data) return Response.json({ error: "Return status could not be updated." }, { status: 409 }); entityId = input.returnId; entityType = "return";
  } else if (input.action === "mark_admin_notifications_read") {
    const { error } = await service.from("vlr_notifications").update({ is_read: true }).eq("audience", "admin").eq("is_read", false); if (error) return Response.json({ error: "Notifications could not be updated." }, { status: 409 }); entityId = "all"; entityType = "notification";
  }

  await service.from("vlr_admin_audit_logs").insert({ actor_id: user.id, action: input.action, entity_type: entityType, entity_id: entityId });
  if (["create_product", "update_product", "delete_product", "toggle_product", "archive_product", "upsert_category", "delete_category"].includes(input.action)) {
    revalidatePath("/");
  }
  return Response.json({ ok: true });
}
