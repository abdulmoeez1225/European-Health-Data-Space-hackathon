import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  // Static export: FastAPI serves frontend/out; no Node server at runtime.
  output: "export",
  trailingSlash: true,
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true },
  env: {
    // Same origin in production; the dev server talks to the backend directly (CORS allows :3000).
    NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE ?? (isDev ? "http://localhost:8000" : ""),
  },
};

export default nextConfig;
