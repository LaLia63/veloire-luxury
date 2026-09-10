import { Storefront } from "@/components/storefront";
import { FALLBACK_DEPARTMENTS, FALLBACK_PRODUCTS } from "@/lib/catalog-fallback";
import { getPublicServerClient } from "@/lib/supabase-server";
import type { Department, Product } from "@/lib/types";

// Catalog changes are pushed to open clients through Supabase Realtime. Keep
// refreshes uncached so a router.refresh() always reads the current catalog.
export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = getPublicServerClient();
  const [productResult, departmentResult] = await Promise.all([
    supabase.from("vlr_products").select("id,slug,name,description,product_type,base_price,material,care,shipping_note,return_policy,primary_image_url,hover_image_url,is_featured,is_new_arrival,department:vlr_departments(id,slug,name),category:vlr_categories(id,slug,name),variants:vlr_product_variants(id,sku,option_values,price_adjustment,stock,low_stock_threshold,is_active)").order("is_featured", { ascending: false }).order("created_at", { ascending: false }).abortSignal(AbortSignal.timeout(3500)),
    supabase.from("vlr_departments").select("id,slug,name,sort_order,categories:vlr_categories(id,department_id,slug,name,sort_order)").order("sort_order").order("sort_order", { referencedTable: "vlr_categories" }).abortSignal(AbortSignal.timeout(3500)),
  ]);
  // An empty successful response is a real empty catalog. Only use the static
  // fallback when Supabase itself cannot be reached; otherwise deleted or
  // archived admin items would incorrectly reappear on the storefront.
  const products = productResult.error
    ? FALLBACK_PRODUCTS
    : (productResult.data ?? []) as unknown as Product[];
  const departments = departmentResult.error
    ? FALLBACK_DEPARTMENTS
    : (departmentResult.data ?? []) as unknown as Department[];
  return <Storefront products={products} departments={departments} catalogAuthoritative={!productResult.error}/>;
}
