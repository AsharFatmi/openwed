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

const pool = globalForPrisma.pgPool ?? new pg.Pool({
  connectionString,
  ssl: sslCert ? { ca: sslCert } : { rejectUnauthorized: false },
  max: 1,
  idleTimeoutMillis: 5000,
  connectionTimeoutMillis: 5000,
})

globalForPrisma.pgPool = pool

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter: new PrismaPg(pool) })

globalForPrisma.prisma = prisma
