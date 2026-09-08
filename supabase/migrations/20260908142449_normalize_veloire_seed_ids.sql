delete from public.vlr_products where slug in (
  'sculpted-oxblood-gown','maison-noir-blazer','rivoli-ivory-shirt','palais-leather-bag',
  'minuit-timepiece','ambre-voile-parfum','petite-nocturne-dress','atelier-building-set'
);

with product_seed(id,slug,name,description,department_slug,category_slug,product_type,base_price,material,primary_image_url,is_featured,is_new_arrival) as (values
  ('00000000-0000-4000-8000-000000000101'::uuid,'sculpted-oxblood-gown','Sculpted Oxblood Gown','A column silhouette cut with a sculptural drape and restrained evening presence.','women','dresses','Clothing',1280000::numeric,'Silk crepe blend','/images/campaign/veloire-hero.webp',true,true),
  ('00000000-0000-4000-8000-000000000102'::uuid,'maison-noir-blazer','Maison Noir Blazer','Single-breasted tailoring with an elongated line and hand-finished interior.','men','jackets','Clothing',980000::numeric,'Wool and silk','/images/campaign/veloire-men.webp',true,true),
  ('00000000-0000-4000-8000-000000000103'::uuid,'rivoli-ivory-shirt','Rivoli Ivory Shirt','A fluid formal shirt balanced by a sharp point collar.','men','shirts','Clothing',420000::numeric,'Silk poplin','/images/campaign/veloire-men.webp',false,true),
  ('00000000-0000-4000-8000-000000000104'::uuid,'palais-leather-bag','Palais Leather Bag','Structured top-handle bag with a discreet sculptural clasp.','women','handbags','Leather Goods',760000::numeric,'Full-grain leather','/images/campaign/veloire-accessories.webp',true,true),
  ('00000000-0000-4000-8000-000000000105'::uuid,'minuit-timepiece','Minuit Timepiece','A slender evening watch with a minimal dial and polished case.','men','watches','Watch',1150000::numeric,'Steel and leather','/images/campaign/veloire-accessories.webp',true,false),
  ('00000000-0000-4000-8000-000000000106'::uuid,'ambre-voile-parfum','Ambre Voile Parfum','Dry amber, iris and cedar composed as a quiet, lingering veil.','women','fragrance','Fragrance',310000::numeric,'Eau de parfum 75ml','/images/campaign/veloire-accessories.webp',false,true),
  ('00000000-0000-4000-8000-000000000107'::uuid,'petite-nocturne-dress','Petite Nocturne Dress','A softly structured occasion dress designed for ease of movement.','kids','dresses','Kids Clothing',280000::numeric,'Cotton silk','/images/campaign/veloire-hero.webp',false,true),
  ('00000000-0000-4000-8000-000000000108'::uuid,'atelier-building-set','Atelier Building Set','A tactile architectural play set in responsibly sourced wood.','kids','educational-toys','Toy',145000::numeric,'FSC-certified wood','/images/campaign/veloire-accessories.webp',false,false)
)
insert into public.vlr_products (id,slug,name,description,department_id,category_id,product_type,base_price,material,care,shipping_note,return_policy,primary_image_url,hover_image_url,is_featured,is_new_arrival)
select p.id,p.slug,p.name,p.description,d.id,c.id,p.product_type,p.base_price,p.material,'Professional care recommended.','Complimentary signature packaging.','Returns accepted within 14 days of delivery.',p.primary_image_url,'/images/campaign/veloire-accessories.webp',p.is_featured,p.is_new_arrival
from product_seed p join public.vlr_departments d on d.slug=p.department_slug join public.vlr_categories c on c.department_id=d.id and c.slug=p.category_slug;

insert into public.vlr_product_variants (id, product_id, sku, option_values, stock, price_adjustment)
select ('00000000-0000-4000-8000-' || lpad((200 + row_number() over(order by p.id))::text,12,'0'))::uuid,
  p.id, 'VLR-' || lpad((100 + row_number() over(order by p.id))::text,4,'0'),
  case when p.product_type='Clothing' then jsonb_build_object('Size','M','Color',case when p.slug like '%oxblood%' then 'Oxblood' else 'Noir' end)
       when p.product_type='Kids Clothing' then jsonb_build_object('Age','6–7 Years','Color','Oxblood')
       when p.product_type='Watch' then jsonb_build_object('Strap','Noir Leather','Dial','Ivory')
       when p.product_type='Leather Goods' then jsonb_build_object('Color','Oxblood','Material','Leather')
       when p.product_type='Toy' then jsonb_build_object('Age Range','5+ Years')
       else jsonb_build_object('Size','75 ml') end,
  case when p.product_type='Toy' then 12 else 8 end, 0
from public.vlr_products p where p.id::text like '00000000-0000-4000-8000-0000000001%';
