import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Webhook bodies must be read raw for signature verification; route handlers do that themselves.
  poweredByHeader: false,
};

export default nextConfig;
