import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.googleusercontent.com" },
      { protocol: "https", hostname: "vlaigcvllbjvapktnirj.supabase.co", pathname: "/storage/v1/object/public/vlr-profile-avatars/**" },
    ],
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
