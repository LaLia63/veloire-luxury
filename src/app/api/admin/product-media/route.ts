import { getServiceClient } from "@/lib/supabase-server";

const PRODUCT_MEDIA_BUCKET = "vlr-product-media";
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const imageTypes = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
} as const;

type SupportedImageType = keyof typeof imageTypes;

async function getAdmin(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return null;

  const { data: profile } = await service
    .from("vlr_profiles")
    .select("role,is_active")
    .eq("id", user.id)
    .maybeSingle();

  return profile?.role === "admin" && profile.is_active !== false ? { service } : null;
}

function hasValidSignature(bytes: Uint8Array, type: SupportedImageType) {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes.slice(0, 8).every((byte, index) => byte === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index]);
  if (type === "image/webp") return new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  if (type === "image/avif") {
    const box = new TextDecoder().decode(bytes.slice(4));
    return box.startsWith("ftyp") && (box.includes("avif") || box.includes("avis"));
  }
  const header = new TextDecoder().decode(bytes.slice(0, 6));
  return header === "GIF87a" || header === "GIF89a";
}

export async function POST(request: Request) {
  const admin = await getAdmin(request);
  if (!admin) return Response.json({ error: "Admin access required" }, { status: 403 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Choose an image to upload." }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return Response.json({ error: "Product images must be 4 MB or smaller." }, { status: 413 });
  }
  if (!(file.type in imageTypes)) {
    return Response.json({ error: "Use a JPG, JPEG, PNG, WEBP, GIF, or AVIF image." }, { status: 415 });
  }

  const type = file.type as SupportedImageType;
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  const validExtensions = type === "image/jpeg" ? ["jpg", "jpeg"] : [imageTypes[type]];
  if (!validExtensions.includes(extension)) {
    return Response.json({ error: "The image extension does not match its file type." }, { status: 415 });
  }
  const buffer = await file.arrayBuffer();
  if (!hasValidSignature(new Uint8Array(buffer.slice(0, 64)), type)) {
    return Response.json({ error: "The selected file is not a valid image." }, { status: 415 });
  }

  const path = `products/${crypto.randomUUID()}.${imageTypes[type]}`;
  const { error } = await admin.service.storage.from(PRODUCT_MEDIA_BUCKET).upload(path, buffer, {
    cacheControl: "31536000",
    contentType: type,
    upsert: false,
  });
  if (error) return Response.json({ error: "The product image could not be uploaded." }, { status: 502 });

  const { data } = admin.service.storage.from(PRODUCT_MEDIA_BUCKET).getPublicUrl(path);
  return Response.json({ url: data.publicUrl, path });
}
