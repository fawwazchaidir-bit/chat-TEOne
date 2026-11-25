import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Header keamanan dasar. CSP memakai 'unsafe-inline' untuk style karena Next.js menyisipkan style inline;
// script inline hanya diizinkan oleh Next.js untuk bootstrap hidrasi (lihat docs/keamanan.md §Header).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const config: NextConfig = {
  output: "standalone",
  // Pemeriksaan tipe saat build hanya untuk berkas yang ada di image (tanpa tests/ & konfigurasi uji) — lihat tsconfig.build.json.
  typescript: { tsconfigPath: "tsconfig.build.json" },
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["pg", "@node-rs/argon2"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default config;
