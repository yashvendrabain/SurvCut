import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // API rewrites so `/api/*` on the frontend hits the FastAPI backend
  // during local dev without dealing with CORS.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8000/api/:path*",
      },
    ];
  },
};

export default config;