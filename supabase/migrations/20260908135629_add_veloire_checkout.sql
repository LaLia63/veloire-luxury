create or replace function public.vlr_create_order(
  p_user_id uuid,
  p_items jsonb,
  p_contact jsonb,
  p_delivery_address jsonb,
  p_delivery_method text default 'standard',
  p_loyalty_points integer default 0
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  variant_row record;
  order_id uuid;
  subtotal_amount numeric(14,2) := 0;
  delivery_amount numeric(14,2);
  loyalty_discount_amount numeric(14,2) := 0;
  available_points integer;
  earned_points integer;
  result jsonb;
begin
  if p_user_id is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A signed-in customer and at least one item are required';
  end if;
  if coalesce(p_contact ->> 'email','') = '' or coalesce(p_contact ->> 'phone','') = '' then
    raise exception 'Contact information is required';
  end if;
  if coalesce(p_delivery_address ->> 'address_line_1','') = '' or coalesce(p_delivery_address ->> 'city','') = '' then
    raise exception 'A complete delivery address is required';
  end if;

  for item in select * from jsonb_array_elements(p_items)
  loop
    if coalesce((item ->> 'quantity')::integer, 0) <= 0 then raise exception 'Quantity must be positive'; end if;
    select v.id, v.sku, v.option_values, v.stock, v.is_active, v.price_adjustment,
           p.id as product_id, p.name as product_name, p.base_price, p.primary_image_url, p.is_available
      into variant_row
      from public.vlr_product_variants v
      join public.vlr_products p on p.id = v.product_id
      where v.id = (item ->> 'variantId')::uuid
      for update of v;
    if not found or not variant_row.is_active or not variant_row.is_available then raise exception 'A selected variant is unavailable'; end if;
    if variant_row.stock < (item ->> 'quantity')::integer then raise exception 'Requested quantity exceeds available stock for %', variant_row.product_name; end if;
    subtotal_amount := subtotal_amount + (variant_row.base_price + variant_row.price_adjustment) * (item ->> 'quantity')::integer;
  end loop;

  select loyalty_points into available_points from public.vlr_profiles where id = p_user_id for update;
  p_loyalty_points := greatest(0, coalesce(p_loyalty_points, 0));
  if p_loyalty_points % 10 <> 0 or p_loyalty_points > coalesce(available_points,0) then raise exception 'Invalid loyalty redemption'; end if;
  loyalty_discount_amount := (p_loyalty_points / 10) * 100;
  if loyalty_discount_amount > subtotal_amount * 0.20 then raise exception 'Loyalty redemption exceeds 20 percent of the order'; end if;
  select delivery_fee into delivery_amount from public.vlr_store_settings where id = true;
  delivery_amount := coalesce(delivery_amount, 5000);
  earned_points := floor(greatest(subtotal_amount - loyalty_discount_amount, 0) / 200000)::integer * 10;

  insert into public.vlr_orders (user_id, contact_email, contact_phone, delivery_address, delivery_method, subtotal, loyalty_discount, delivery_fee, grand_total, loyalty_points_earned, loyalty_points_redeemed)
  values (p_user_id, p_contact ->> 'email', p_contact ->> 'phone', p_delivery_address, p_delivery_method, subtotal_amount, loyalty_discount_amount, delivery_amount, subtotal_amount - loyalty_discount_amount + delivery_amount, earned_points, p_loyalty_points)
  returning id into order_id;

  for item in select * from jsonb_array_elements(p_items)
  loop
    select v.id, v.sku, v.option_values, v.stock, v.price_adjustment,
           p.id as product_id, p.name as product_name, p.base_price, p.primary_image_url
      into variant_row from public.vlr_product_variants v join public.vlr_products p on p.id = v.product_id
      where v.id = (item ->> 'variantId')::uuid for update of v;
    insert into public.vlr_order_items (order_id, product_id, variant_id, product_name, variant_snapshot, sku, unit_price, quantity, line_total, primary_image_url)
    values (order_id, variant_row.product_id, variant_row.id, variant_row.product_name, variant_row.option_values, variant_row.sku, variant_row.base_price + variant_row.price_adjustment, (item ->> 'quantity')::integer, (variant_row.base_price + variant_row.price_adjustment) * (item ->> 'quantity')::integer, variant_row.primary_image_url);
    update public.vlr_product_variants set stock = stock - (item ->> 'quantity')::integer where id = variant_row.id;
  end loop;

  insert into public.vlr_payments (order_id, user_id, amount) select id, user_id, grand_total from public.vlr_orders where id = order_id;
  if p_loyalty_points > 0 then
    update public.vlr_profiles set loyalty_points = loyalty_points - p_loyalty_points where id = p_user_id;
    insert into public.vlr_loyalty_transactions (user_id, order_id, transaction_type, points, description) values (p_user_id, order_id, 'redeemed', -p_loyalty_points, 'Points redeemed at checkout');
  end if;
  insert into public.vlr_notifications (audience, type, title, message) values ('admin', 'new_order', 'New VÉLOIRE order', 'A new order is awaiting KPay payment proof.');
  select jsonb_build_object('id',o.id,'order_number',o.order_number,'subtotal',o.subtotal,'delivery_fee',o.delivery_fee,'loyalty_discount',o.loyalty_discount,'grand_total',o.grand_total,'loyalty_points_earned',o.loyalty_points_earned,'created_at',o.created_at) into result from public.vlr_orders o where o.id = order_id;
  return result;
end;
$$;

revoke all on function public.vlr_create_order(uuid,jsonb,jsonb,jsonb,text,integer) from public, anon, authenticated;
grant execute on function public.vlr_create_order(uuid,jsonb,jsonb,jsonb,text,integer) to service_role;
