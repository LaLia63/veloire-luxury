import { z } from "zod";
import { getServiceClient } from "@/lib/supabase-server";

const checkoutSchema = z.object({
  items: z.array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1).max(20) })).min(1).max(30),
  contact: z.object({ email: z.string().email(), phone: z.string().min(7).max(20) }),
  deliveryAddress: z.object({ recipient_name: z.string().min(2).max(120), address_line_1: z.string().min(5).max(300), city: z.string().min(2).max(120), country: z.string().default("Myanmar") }),
  deliveryMethod: z.enum(["standard", "express"]).default("standard"),
  loyaltyPoints: z.number().int().min(0).default(0),
});

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Please sign in to check out." }, { status: 401 });
  const service = getServiceClient();
  const { data: { user }, error: authError } = await service.auth.getUser(token);
  if (authError || !user) return Response.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });
  const { data: profile } = await service.from("vlr_profiles").select("is_active").eq("id", user.id).maybeSingle();
  if (profile?.is_active === false) return Response.json({ error: "This account is disabled. Please contact VÉLOIRE concierge." }, { status: 403 });
  const parsed = checkoutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Please review your contact, address and quantities." }, { status: 400 });
  const payload = parsed.data;
  const { data, error } = await service.rpc("vlr_create_order", { p_user_id: user.id, p_items: payload.items, p_contact: payload.contact, p_delivery_address: payload.deliveryAddress, p_delivery_method: payload.deliveryMethod, p_loyalty_points: payload.loyaltyPoints });
  if (error) return Response.json({ error: error.message.includes("stock") ? error.message : "The order could not be validated. Please review your selection." }, { status: 409 });
  return Response.json({ order: data }, { status: 201 });
}
