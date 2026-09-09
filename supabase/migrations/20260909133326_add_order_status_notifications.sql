alter table public.vlr_notifications
  add column order_id uuid references public.vlr_orders(id) on delete cascade;

create index vlr_notifications_order_idx
  on public.vlr_notifications(order_id, created_at desc)
  where order_id is not null;

create or replace function vlr_private.notify_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  notification_title text;
  notification_message text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  notification_title := case new.status
    when 'confirmed' then 'Order confirmed'
    when 'preparing' then 'Order preparation started'
    when 'quality_inspection' then 'Quality inspection'
    when 'luxury_packaging' then 'Signature packaging'
    when 'shipped' then 'Order shipped'
    when 'delivered' then 'Order delivered'
    when 'cancelled' then 'Order cancelled'
    when 'return_in_progress' then 'Return in progress'
    when 'refunded' then 'Order refunded'
    else 'Order status updated'
  end;

  notification_message := case new.status
    when 'confirmed' then format('Your order %s has been confirmed.', new.order_number)
    when 'preparing' then format('Your order %s is being prepared by our team.', new.order_number)
    when 'quality_inspection' then format('Your order %s is undergoing quality inspection.', new.order_number)
    when 'luxury_packaging' then format('Your order %s is receiving its signature packaging.', new.order_number)
    when 'shipped' then format('Your order %s has left the Maison and is on its way.', new.order_number)
    when 'delivered' then format('Your order %s has been delivered.', new.order_number)
    when 'cancelled' then format('Your order %s has been cancelled.', new.order_number)
    when 'return_in_progress' then format('The return for order %s is now in progress.', new.order_number)
    when 'refunded' then format('Your refund for order %s has been completed.', new.order_number)
    else format('Your order %s status changed to %s.', new.order_number, replace(new.status, '_', ' '))
  end;

  insert into public.vlr_notifications (user_id, order_id, audience, type, title, message)
  values (new.user_id, new.id, 'customer', 'order_status_changed', notification_title, notification_message);

  return new;
end;
$$;

revoke all on function vlr_private.notify_order_status_change() from public, anon, authenticated;

drop trigger if exists vlr_order_status_notification on public.vlr_orders;
create trigger vlr_order_status_notification
after update of status on public.vlr_orders
for each row
when (old.status is distinct from new.status)
execute function vlr_private.notify_order_status_change();

-- Payment verification changes the linked order to confirmed. The order trigger
-- above is the single source for that customer notification. Rejection remains a
-- payment-specific notification because it does not change the order status.
create or replace function vlr_private.sync_verified_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  earned_points integer;
  order_user uuid;
  eligible numeric(14,2);
begin
  if new.status = 'verified' and old.status is distinct from 'verified' then
    select user_id, greatest(subtotal - discount - loyalty_discount, 0)
      into order_user, eligible
      from public.vlr_orders where id = new.order_id for update;
    earned_points := floor(eligible / 200000)::integer * 10;

    update public.vlr_orders
      set payment_status = 'verified', status = 'confirmed', loyalty_points_earned = earned_points, updated_at = now()
      where id = new.order_id and payment_status <> 'verified';

    if earned_points > 0 then
      insert into public.vlr_loyalty_transactions (user_id, order_id, transaction_type, points, description)
      values (order_user, new.order_id, 'earned', earned_points, 'Points earned from verified order')
      on conflict do nothing;
      if found then
        update public.vlr_profiles set loyalty_points = loyalty_points + earned_points, updated_at = now() where id = order_user;
      end if;
    end if;
  elsif new.status = 'rejected' and old.status is distinct from 'rejected' then
    select user_id into order_user from public.vlr_orders where id = new.order_id;
    update public.vlr_orders set payment_status = 'rejected', updated_at = now() where id = new.order_id;
    insert into public.vlr_notifications (user_id, order_id, audience, type, title, message)
    values (order_user, new.order_id, 'customer', 'payment_rejected', 'Payment proof needs attention', 'We could not verify your payment proof. Please review it and submit a clear screenshot.');
  end if;
  return new;
end;
$$;

revoke all on function vlr_private.sync_verified_payment() from public, anon, authenticated;

-- Postgres Changes only emits rows for tables in the realtime publication.
-- RLS still limits each subscriber to their own notification rows.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'vlr_notifications'
  ) then
    alter publication supabase_realtime add table public.vlr_notifications;
  end if;
end
$$;
