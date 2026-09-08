import { Storefront } from "@/components/storefront";
import { FALLBACK_DEPARTMENTS, FALLBACK_PRODUCTS } from "@/lib/catalog-fallback";
import { getPublicServerClient } from "@/lib/supabase-server";
import type { Department, Product } from "@/lib/types";

export const revalidate = 60;

export default async function Home() {
  const supabase = getPublicServerClient();
  const [{ data: productRows }, { data: departmentRows }] = await Promise.all([
    supabase.from("vlr_products").select("id,slug,name,description,product_type,base_price,material,care,shipping_note,return_policy,primary_image_url,hover_image_url,is_featured,is_new_arrival,department:vlr_departments(id,slug,name),category:vlr_categories(id,slug,name),variants:vlr_product_variants(id,sku,option_values,price_adjustment,stock,low_stock_threshold,is_active)").order("is_featured", { ascending: false }).order("created_at", { ascending: false }).abortSignal(AbortSignal.timeout(3500)),
    supabase.from("vlr_departments").select("id,slug,name,sort_order,categories:vlr_categories(id,department_id,slug,name,sort_order)").order("sort_order").order("sort_order", { referencedTable: "vlr_categories" }).abortSignal(AbortSignal.timeout(3500)),
  ]);
  const products = productRows?.length ? productRows as unknown as Product[] : FALLBACK_PRODUCTS;
  const departments = departmentRows?.length ? departmentRows as unknown as Department[] : FALLBACK_DEPARTMENTS;
  return <Storefront products={products} departments={departments}/>;
}
