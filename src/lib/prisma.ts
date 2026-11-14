import "server-only";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function buildDatasourceUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", "15");
    }
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", "20");
    }
    return url.toString();
  } catch {
    return raw;
  }
}

const dbUrl = buildDatasourceUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient(dbUrl ? { datasources: { db: { url: dbUrl } } } : undefined);

globalForPrisma.prisma = prisma;
