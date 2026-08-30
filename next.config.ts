import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Default Server Action body limit is 1MB - too small for a phone camera
  // photo of a receipt (the Deposit Payment upload), which routinely exceeds
  // that even as a single JPEG.
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
