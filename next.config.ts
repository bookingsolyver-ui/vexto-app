import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite que aceda à página através do IP do seu telemóvel/rede
  allowedDevOrigins: ['172.20.10.10', 'localhost:3000'],
};

export default nextConfig;