import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // 상위 폴더(링크나무)의 lockfile과 헷갈리지 않도록 이 앱 폴더를 루트로 고정
    root: import.meta.dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
