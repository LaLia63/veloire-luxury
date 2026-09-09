import type { Department, Product } from "./types";

const categorySets: Record<string, string[]> = {
  women: ["Dresses","Tops","Shirts","Jackets","Pants","Jeans","Skirts","Shoes","Heels","Handbags","Purses","Jewelry","Watches","Fragrance"],
  men: ["T-Shirts","Shirts","Hoodies","Jackets","Formal","Suits","Pants","Jeans","Shoes","Bags","Wallets","Watches","Jewelry","Fragrance"],
  kids: ["Girls","Boys","Baby","T-Shirts","Dresses","Jackets","Pants","Shoes","Bags","Toys","Educational Toys","School"],
};
const slugify = (value: string) => value.toLowerCase().replaceAll(" ", "-");

export const FALLBACK_DEPARTMENTS: Department[] = ["women","men","kids"].map((slug, index) => ({ id: index + 1, slug, name: slug.toUpperCase(), sort_order: index + 1, categories: categorySets[slug].map((name, categoryIndex) => ({ id: (index + 1) * 100 + categoryIndex, department_id: index + 1, slug: slugify(name), name, sort_order: categoryIndex + 1 })) }));

const base = [
  ["sculpted-oxblood-gown","Sculpted Oxblood Gown","A column silhouette cut with a sculptural drape and restrained evening presence.","women","dresses","Clothing",1280000,"Silk crepe blend","/images/products/sculpted-oxblood-gown.webp",true,true],
  ["maison-noir-blazer","Maison Noir Blazer","Single-breasted tailoring with an elongated line and hand-finished interior.","men","jackets","Clothing",980000,"Wool and silk","/images/products/maison-noir-blazer.webp",true,true],
  ["rivoli-ivory-shirt","Rivoli Ivory Shirt","A fluid formal shirt balanced by a sharp point collar.","men","shirts","Clothing",420000,"Silk poplin","/images/products/rivoli-ivory-shirt.webp",false,true],
  ["palais-leather-bag","Palais Leather Bag","Structured top-handle bag with a discreet sculptural clasp.","women","handbags","Leather Goods",760000,"Full-grain leather","/images/products/palais-leather-bag.webp",true,true],
  ["minuit-timepiece","Minuit Timepiece","A slender evening watch with a minimal dial and polished case.","men","watches","Watch",1150000,"Steel and leather","/images/products/minuit-timepiece.webp",true,false],
  ["ambre-voile-parfum","Ambre Voile Parfum","Dry amber, iris and cedar composed as a quiet, lingering veil.","women","fragrance","Fragrance",310000,"Eau de parfum 75ml","/images/products/ambre-voile-parfum.webp",false,true],
  ["petite-nocturne-dress","Petite Nocturne Dress","A softly structured occasion dress designed for ease of movement.","kids","dresses","Kids Clothing",280000,"Cotton silk","/images/products/petite-nocturne-dress.webp",false,true],
  ["atelier-building-set","Atelier Building Set","A tactile architectural play set in responsibly sourced wood.","kids","educational-toys","Toy",145000,"FSC-certified wood","/images/products/atelier-building-set.webp",false,false],
] as const;

export const FALLBACK_PRODUCTS: Product[] = base.map((row, index) => {
  const [slug,name,description,departmentSlug,categorySlug,productType,price,material,image,featured,newArrival] = row;
  const department = FALLBACK_DEPARTMENTS.find((item) => item.slug === departmentSlug)!;
  const category = department.categories.find((item) => item.slug === categorySlug)!;
  const productNumber = 101 + index; const variantNumber = 201 + index;
  const options: Record<string, string> = productType === "Clothing" ? { Size:"M", Color:slug.includes("oxblood")?"Oxblood":"Noir" } : productType === "Kids Clothing" ? { Age:"6–7 Years", Color:"Oxblood" } : productType === "Watch" ? { Strap:"Noir Leather", Dial:"Ivory" } : productType === "Leather Goods" ? { Color:"Oxblood", Material:"Leather" } : productType === "Toy" ? { "Age Range":"5+ Years" } : { Size:"75 ml" };
  return { id:`00000000-0000-4000-8000-${String(productNumber).padStart(12,"0")}`,slug,name,description,product_type:productType,base_price:price,material,care:"Professional care recommended.",shipping_note:"Complimentary signature packaging.",return_policy:"Returns accepted within 14 days of delivery.",primary_image_url:image,hover_image_url:null,is_featured:featured,is_new_arrival:newArrival,department:{id:department.id,slug:department.slug,name:department.name},category:{id:category.id,slug:category.slug,name:category.name},variants:[{id:`00000000-0000-4000-8000-${String(variantNumber).padStart(12,"0")}`,sku:`VLR-${String(productNumber).padStart(4,"0")}`,option_values:options,price_adjustment:0,stock:productType==="Toy"?12:8,low_stock_threshold:3,is_active:true}] };
});
