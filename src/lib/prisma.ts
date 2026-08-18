import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import fs from 'fs'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient; pgPool: pg.Pool }

const connectionString = (process.env.DATABASE_URL ?? '').replace(/[?&]sslmode=[^&]*/g, '')

// Support base64 env var (Vercel) or local file path (dev)
const sslCert = process.env.DB_SSL_CERT
  ? Buffer.from(process.env.DB_SSL_CERT, 'base64').toString()
  : process.env.DB_SSL_CERT_PATH
    ? fs.readFileSync(process.env.DB_SSL_CERT_PATH).toString()
    : null

// SSL on only when a CA cert is provided or the URL explicitly requests it
// (e.g. Neon/Supabase `sslmode=require`). Local Postgres (Docker) has no SSL.
const sslMode = (process.env.DATABASE_URL ?? '').match(/[?&]sslmode=([^&]*)/)?.[1]
const ssl = sslCert
  ? { ca: sslCert }
  : sslMode === 'require' || sslMode === 'verify-full' || sslMode === 'verify-ca'
    ? { rejectUnauthorized: false }
    : false

const pool = globalForPrisma.pgPool ?? new pg.Pool({
  connectionString,
  ssl,
  max: 1,
  idleTimeoutMillis: 5000,
  connectionTimeoutMillis: 5000,
})

globalForPrisma.pgPool = pool

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter: new PrismaPg(pool) })

globalForPrisma.prisma = prisma
