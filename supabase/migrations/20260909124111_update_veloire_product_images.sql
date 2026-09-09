update public.vlr_products
set primary_image_url = case slug
  when 'sculpted-oxblood-gown' then '/images/products/sculpted-oxblood-gown.webp'
  when 'maison-noir-blazer' then '/images/products/maison-noir-blazer.webp'
  when 'rivoli-ivory-shirt' then '/images/products/rivoli-ivory-shirt.webp'
  when 'palais-leather-bag' then '/images/products/palais-leather-bag.webp'
  when 'minuit-timepiece' then '/images/products/minuit-timepiece.webp'
  when 'ambre-voile-parfum' then '/images/products/ambre-voile-parfum.webp'
  when 'petite-nocturne-dress' then '/images/products/petite-nocturne-dress.webp'
  when 'atelier-building-set' then '/images/products/atelier-building-set.webp'
  else primary_image_url
end,
hover_image_url = null
where slug in (
  'sculpted-oxblood-gown',
  'maison-noir-blazer',
  'rivoli-ivory-shirt',
  'palais-leather-bag',
  'minuit-timepiece',
  'ambre-voile-parfum',
  'petite-nocturne-dress',
  'atelier-building-set'
);
