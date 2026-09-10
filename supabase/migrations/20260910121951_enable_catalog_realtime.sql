-- Publish public catalog mutations so open storefronts can refresh immediately.
-- The block is idempotent for environments where one or more tables were
-- already enabled through the Supabase dashboard.
do $$
declare
  catalog_table text;
begin
  foreach catalog_table in array array[
    'vlr_departments',
    'vlr_categories',
    'vlr_products',
    'vlr_product_variants'
  ] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = catalog_table
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        catalog_table
      );
    end if;
  end loop;
end
$$;
