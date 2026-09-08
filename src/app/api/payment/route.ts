import { z } from "zod";
import { getServiceClient } from "@/lib/supabase-server";

const schema = z.object({ orderId: z.string().uuid(), proofPath: z.string().min(10).max(500) });

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !parsed.data.proofPath.startsWith(`${user.id}/`)) return Response.json({ error: "Invalid payment proof" }, { status: 400 });
  const { data: order } = await service.from("vlr_orders").select("id,user_id,payment_status").eq("id", parsed.data.orderId).eq("user_id", user.id).maybeSingle();
  if (!order || order.payment_status === "verified") return Response.json({ error: "Order cannot accept a payment proof" }, { status: 409 });
  const { error } = await service.from("vlr_payments").update({ proof_path: parsed.data.proofPath, status: "payment_submitted", submitted_at: new Date().toISOString(), rejection_reason: null }).eq("order_id", order.id).eq("user_id", user.id);
  if (error) return Response.json({ error: "Payment submission failed" }, { status: 500 });
  await service.from("vlr_orders").update({ payment_status: "payment_submitted" }).eq("id", order.id);
  await service.from("vlr_notifications").insert([{ user_id: user.id, audience: "customer", type: "payment_submitted", title: "Payment submitted", message: "Your KPay proof is awaiting verification." }, { audience: "admin", type: "payment_submitted", title: "Payment proof received", message: `Payment proof for ${order.id} requires review.` }]);
  return Response.json({ ok: true });
}
