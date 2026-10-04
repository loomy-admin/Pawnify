import path from "node:path";
import type { NextConfig } from "next";

const emptyModule = path.resolve(__dirname, "src/lib/empty.js");

const nextConfig: NextConfig = {
  serverExternalPackages: ["sequelize", "mysql2", "bcryptjs"],
  turbopack: {
    root: path.resolve(__dirname),
    resolveAlias: {
      "pg-hstore": emptyModule,
      pg: emptyModule,
      sqlite3: emptyModule,
      tedious: emptyModule,
      oracledb: emptyModule,
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "pg-hstore": false,
      pg: false,
      sqlite3: false,
      tedious: false,
      oracledb: false,
    };
    return config;
  },
};

export default nextConfig;
