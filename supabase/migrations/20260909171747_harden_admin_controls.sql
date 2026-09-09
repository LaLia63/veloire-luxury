-- Customer account moderation lives in the profile row so every server route can
-- apply one consistent check. These columns are intentionally omitted from the
-- authenticated role's column-level UPDATE grant in the initial migration.
alter table public.vlr_profiles
  add column is_active boolean not null default true,
  add column disabled_at timestamptz,
  add column disabled_reason text;

alter table public.vlr_profiles
  add constraint vlr_profiles_disabled_reason_length
    check (disabled_reason is null or char_length(disabled_reason) <= 300),
  add constraint vlr_profiles_disabled_state
    check (is_active or disabled_at is not null),
  add constraint vlr_profiles_admins_remain_active
    check (role <> 'admin' or is_active);

comment on column public.vlr_profiles.is_active is
  'Application access switch controlled only by trusted VÉLOIRE admin routes.';
comment on column public.vlr_profiles.disabled_at is
  'Timestamp recorded when an administrator disables a customer account.';

create index vlr_profiles_customer_status_idx
  on public.vlr_profiles(is_active, created_at desc)
  where role = 'customer';

-- This helper protects direct browser access after an account is disabled.
-- Server routes use the service role and must still check vlr_profiles.is_active
-- before performing actions on behalf of a customer.
create or replace function vlr_private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.vlr_profiles
    where id = (select auth.uid())
      and is_active
  );
$$;

revoke all on function vlr_private.is_active_user() from public, anon, authenticated;
grant execute on function vlr_private.is_active_user() to authenticated;

-- Restrictive policies combine with the existing ownership policies, so an
-- account must both own a row and remain active. Admin reads remain available.
create policy "vlr active accounts update profiles"
on public.vlr_profiles
as restrictive
for update
to authenticated
using ((select vlr_private.is_active_user()) or (select vlr_private.is_admin()))
with check ((select vlr_private.is_active_user()) or (select vlr_private.is_admin()));

create policy "vlr active accounts access wishlist"
on public.vlr_wishlist_items
as restrictive
for all
to authenticated
using ((select vlr_private.is_active_user()) or (select vlr_private.is_admin()))
with check ((select vlr_private.is_active_user()) or (select vlr_private.is_admin()));

create policy "vlr active accounts access bag"
on public.vlr_bag_items
as restrictive
for all
to authenticated
using ((select vlr_private.is_active_user()) or (select vlr_private.is_admin()))
with check ((select vlr_private.is_active_user()) or (select vlr_private.is_admin()));

create policy "vlr active accounts access recent views"
on public.vlr_recently_viewed
as restrictive
for all
to authenticated
using ((select vlr_private.is_active_user()) or (select vlr_private.is_admin()))
with check ((select vlr_private.is_active_user()) or (select vlr_private.is_admin()));

create policy "vlr active accounts access addresses"
on public.vlr_addresses
as restrictive
for all
to authenticated
using ((select vlr_private.is_active_user()) or (select vlr_private.is_admin()))
with check ((select vlr_private.is_active_user()) or (select vlr_private.is_admin()));

create policy "vlr active accounts read orders"
on public.vlr_orders
as restrictive
for select
to authenticated
using ((select vlr_private.is_active_user()) or (select vlr_private.is_admin()));

create policy "vlr active accounts read order items"
on public.vlr_order_items
as restrictive
for select
to authenticated
using ((select vlr_private.is_active_user()) or (select vlr_private.is_admin()));

create policy "vlr active accounts read payments"
on public.vlr_payments
as restrictive
for select
to authenticated
using ((select vlr_private.is_active_user()) or (select vlr_private.is_admin()));

create policy "vlr active accounts access returns"
on public.vlr_returns
as restrictive
for all
to authenticated
using ((select vlr_private.is_active_user()) or (select vlr_private.is_admin()))
with check ((select vlr_private.is_active_user()) or (select vlr_private.is_admin()));

create policy "vlr active accounts access return items"
on public.vlr_return_items
as restrictive
for all
to authenticated
using ((select vlr_private.is_active_user()) or (select vlr_private.is_admin()))
with check ((select vlr_private.is_active_user()) or (select vlr_private.is_admin()));

create policy "vlr active accounts read loyalty"
on public.vlr_loyalty_transactions
as restrictive
for select
to authenticated
using ((select vlr_private.is_active_user()) or (select vlr_private.is_admin()));

create policy "vlr active accounts access notifications"
on public.vlr_notifications
as restrictive
for all
to authenticated
using ((select vlr_private.is_active_user()) or (select vlr_private.is_admin()))
with check ((select vlr_private.is_active_user()) or (select vlr_private.is_admin()));

-- Admin notifications have audience='admin' and a null user_id. Extend the
-- update policy so administrators can mark these Realtime notifications read.
drop policy if exists "vlr users mark own notifications read" on public.vlr_notifications;
create policy "vlr users mark visible notifications read"
on public.vlr_notifications
for update
to authenticated
using (
  user_id = (select auth.uid())
  or (audience = 'admin' and (select vlr_private.is_admin()))
)
with check (
  user_id = (select auth.uid())
  or (audience = 'admin' and (select vlr_private.is_admin()))
);

-- Tighten VÉLOIRE's private-upload policies for disabled customers while
-- retaining administrator access to payment proofs and return evidence.
drop policy if exists "vlr users upload payment proof" on storage.objects;
create policy "vlr users upload payment proof"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'vlr-payment-proofs'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select vlr_private.is_active_user())
);

drop policy if exists "vlr users read own payment proof" on storage.objects;
create policy "vlr users read own payment proof"
on storage.objects for select
to authenticated
using (
  bucket_id = 'vlr-payment-proofs'
  and (
    ((storage.foldername(name))[1] = (select auth.uid())::text and (select vlr_private.is_active_user()))
    or (select vlr_private.is_admin())
  )
);

drop policy if exists "vlr users upload return photos" on storage.objects;
create policy "vlr users upload return photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'vlr-return-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select vlr_private.is_active_user())
);

drop policy if exists "vlr users read own return photos" on storage.objects;
create policy "vlr users read own return photos"
on storage.objects for select
to authenticated
using (
  bucket_id = 'vlr-return-photos'
  and (
    ((storage.foldername(name))[1] = (select auth.uid())::text and (select vlr_private.is_active_user()))
    or (select vlr_private.is_admin())
  )
);

drop policy if exists "vlr users upload own profile avatar" on storage.objects;
create policy "vlr users upload own profile avatar"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'vlr-profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select vlr_private.is_active_user())
);

drop policy if exists "vlr users list own profile avatars" on storage.objects;
create policy "vlr users list own profile avatars"
on storage.objects for select
to authenticated
using (
  bucket_id = 'vlr-profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select vlr_private.is_active_user())
);

drop policy if exists "vlr users update own profile avatar" on storage.objects;
create policy "vlr users update own profile avatar"
on storage.objects for update
to authenticated
using (
  bucket_id = 'vlr-profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select vlr_private.is_active_user())
)
with check (
  bucket_id = 'vlr-profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select vlr_private.is_active_user())
);

drop policy if exists "vlr users delete own profile avatar" on storage.objects;
create policy "vlr users delete own profile avatar"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'vlr-profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select vlr_private.is_active_user())
);

-- Query paths used by overview charts, payment review, and admin badges.
create index vlr_orders_created_at_idx
  on public.vlr_orders(created_at desc);
create index vlr_orders_verified_created_idx
  on public.vlr_orders(created_at desc)
  where payment_status = 'verified';
create index vlr_payments_submitted_review_idx
  on public.vlr_payments(submitted_at desc)
  where status = 'payment_submitted';
create index vlr_notifications_admin_unread_idx
  on public.vlr_notifications(created_at desc)
  where audience = 'admin' and not is_read;

-- Keep the singleton AI service switch's audit timestamp authoritative.
drop trigger if exists vlr_ai_settings_touch on public.vlr_ai_settings;
create trigger vlr_ai_settings_touch
before update on public.vlr_ai_settings
for each row execute function vlr_private.touch_updated_at();
