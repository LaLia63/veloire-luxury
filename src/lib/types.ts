export type Department = { id: number; slug: string; name: string; sort_order: number; categories: Category[] };
export type Category = { id: number; department_id: number; slug: string; name: string; sort_order: number };
export type Variant = { id: string; sku: string; option_values: Record<string, string>; price_adjustment: number; stock: number; low_stock_threshold: number; is_active: boolean };
export type Product = {
  id: string; slug: string; name: string; description: string; product_type: string; base_price: number;
  material: string | null; care: string | null; shipping_note: string | null; return_policy: string | null;
  primary_image_url: string; hover_image_url: string | null; is_featured: boolean; is_new_arrival: boolean;
  department: { id: number; slug: string; name: string } | null;
  category: { id: number; slug: string; name: string } | null;
  variants: Variant[];
};
export type BagItem = { variantId: string; product: Product; variant: Variant; quantity: number };
export type Profile = { id: string; email: string; full_name: string | null; avatar_url: string | null; phone: string | null; date_of_birth: string | null; gender: string | null; role: "customer" | "admin"; loyalty_points: number };
export type Order = { id: string; order_number: string; status: string; payment_status: string; grand_total: number; created_at: string; loyalty_points_earned: number };
