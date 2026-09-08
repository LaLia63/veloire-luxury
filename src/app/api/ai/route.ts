import { z } from "zod";
import { FALLBACK_PRODUCTS } from "@/lib/catalog-fallback";
import { getServiceClient } from "@/lib/supabase-server";

const bodySchema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(2000) })).max(10),
  bag: z.array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1).max(20) })).max(30),
  user: z.object({ signedIn: z.boolean(), name: z.string().nullable().optional() }),
});
const models = ["gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
type CatalogItem = { id: string; name: string; description: string; base_price: number; product_type: string; variants: { id: string; sku: string; option_values: Record<string,string>; price_adjustment: number; stock: number }[] };
type Action = { type: "add_to_bag" | "remove_from_bag" | "set_quantity"; variantId: string; quantity?: number };

function localFallback(prompt: string, catalog: CatalogItem[], bag: { variantId: string; quantity: number }[]) {
  const myanmar = /[\u1000-\u109F]/.test(prompt);
  const lower = prompt.toLowerCase();
  const wantsRemove = /remove|delete|take out|ဖယ်|လျှော့/.test(lower);
  const wantsIncrease = /increase|more|တိုး/.test(lower);
  const wantsDecrease = /decrease|less|လျှော့/.test(lower);
  const named = catalog.find((item) => lower.includes(item.name.toLowerCase()) || item.name.toLowerCase().split(" ").some((word) => word.length > 5 && lower.includes(word)));
  const bagTarget = bag[0];
  const actions: Action[] = [];
  if (wantsRemove && (named?.variants[0] || bagTarget)) actions.push({ type: "remove_from_bag", variantId: named?.variants[0]?.id ?? bagTarget.variantId });
  else if ((wantsIncrease || wantsDecrease) && bagTarget) actions.push({ type: "set_quantity", variantId: bagTarget.variantId, quantity: Math.max(1, bagTarget.quantity + (wantsIncrease ? 1 : -1)) });
  else if (/add|bag|ထည့်/.test(lower) && named?.variants[0]) actions.push({ type: "add_to_bag", variantId: named.variants[0].id, quantity: 1 });
  const recommendations = catalog.slice(0, 3).map((item) => `${item.name} (${Math.round(item.base_price).toLocaleString()} MMK)`).join(", ");
  const message = myanmar
    ? `လက်ရှိ VÉLOIRE collection ထဲက ${recommendations} ကို အကြံပြုချင်ပါတယ်။ ${actions.length ? "Bag ကို တောင်းဆိုထားသလို ပြင်ဆင်ပေးထားပါတယ်။" : "အခမ်းအနားနဲ့ budget ကိုပြောရင် look တစ်စုံလုံးရွေးပေးနိုင်ပါတယ်။"}`
    : `From the current VÉLOIRE collection, I would consider ${recommendations}. ${actions.length ? "I’ve refined your bag as requested." : "Tell me the occasion and budget, and I’ll compose a complete look."}`;
  return { message, actions };
}

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: "Please rephrase your request.", actions: [] }, { status: 400 });
  const service = getServiceClient();
  const { data } = await service.from("vlr_products").select("id,name,description,base_price,product_type,variants:vlr_product_variants(id,sku,option_values,price_adjustment,stock)").eq("is_available", true).abortSignal(AbortSignal.timeout(3000));
  const fallbackCatalog = FALLBACK_PRODUCTS.map((item) => ({ id:item.id,name:item.name,description:item.description,base_price:item.base_price,product_type:item.product_type,variants:item.variants }));
  const catalog = (((data?.length ? data : fallbackCatalog) ?? []) as unknown as CatalogItem[]).map((item) => ({ ...item, variants: item.variants.filter((variant) => variant.stock > 0) })).filter((item) => item.variants.length > 0);
  const latest = parsed.data.messages.at(-1)?.text ?? "";
  const keys = (process.env.GEMINI_API_KEYS ?? "").split(",").map((key) => key.trim()).filter(Boolean);
  if (!keys.length) return Response.json(localFallback(latest, catalog, parsed.data.bag));
  const catalogContext = catalog.map((item) => ({ id: item.id, name: item.name, description: item.description, price: item.base_price, type: item.product_type, variants: item.variants }));
  const start = Date.now() % keys.length;
  for (let attempt = 0; attempt < models.length; attempt++) {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${models[attempt]}:generateContent?key=${keys[(start + attempt) % keys.length]}`, { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ systemInstruction: { parts: [{ text: `You are VÉLOIRE Private Stylist, a refined bilingual English/Myanmar shopping agent. Answer in the user's language and keep Myanmar natural. Recommend ONLY products and variant IDs in CATALOG. You may add, remove or set bag quantities only through modify_bag. Never change prices, discounts, points, orders, admin state or claim unavailable stock. Guest bag actions are allowed, but account actions are not. CATALOG: ${JSON.stringify(catalogContext)} CURRENT BAG: ${JSON.stringify(parsed.data.bag)}` }] }, contents: parsed.data.messages.map((message) => ({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.text }] })), tools: [{ functionDeclarations: [{ name: "modify_bag", description: "Add, remove, or set the quantity of one exact live catalog variant in the shopping bag.", parameters: { type: "OBJECT", properties: { operation: { type: "STRING", enum: ["add", "remove", "set_quantity"] }, variantId: { type: "STRING" }, quantity: { type: "INTEGER" } }, required: ["operation", "variantId"] } }] }], generationConfig: { temperature: 0.55, maxOutputTokens: 700 } }) });
      clearTimeout(timeout);
      if (!response.ok) continue;
      const payload = await response.json();
      const parts = payload.candidates?.[0]?.content?.parts ?? [];
      const message = parts.filter((part: { text?: string }) => part.text).map((part: { text: string }) => part.text).join("\n").trim();
      const actions = parts.filter((part: { functionCall?: { name: string; args: Record<string, unknown> } }) => part.functionCall?.name === "modify_bag").map((part: { functionCall: { args: { operation: string; variantId: string; quantity?: number } } }) => ({ type: part.functionCall.args.operation === "add" ? "add_to_bag" : part.functionCall.args.operation === "remove" ? "remove_from_bag" : "set_quantity", variantId: part.functionCall.args.variantId, quantity: part.functionCall.args.quantity })) as Action[];
      const validActions = actions.filter((action) => catalog.some((item) => item.variants.some((variant) => variant.id === action.variantId && variant.stock >= (action.quantity ?? 1))));
      if (message || validActions.length) return Response.json({ message: message || (/[\u1000-\u109F]/.test(latest) ? "Bag ကို တောင်းဆိုထားသလို ပြင်ဆင်ပေးထားပါတယ်။" : "I’ve refined your bag as requested."), actions: validActions, model: models[attempt] });
    } catch { clearTimeout(timeout); }
  }
  await service.from("vlr_notifications").insert({ audience: "admin", type: "ai_service_error", title: "AI service fallback used", message: "All configured Gemini model/key attempts were unavailable." });
  return Response.json(localFallback(latest, catalog, parsed.data.bag));
}
