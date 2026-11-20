import { defineConfig } from "prisma/config";

// Base PostgreSQL de Keyo. DATABASE_URL dans apps/api/.env (voir .env.example).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL ?? "postgresql://keyo:keyo@localhost:5432/keyo" },
});
