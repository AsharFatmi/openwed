import { PrismaClient } from '@prisma/client'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { readFile, readFile as fsReadFile } from 'fs/promises'
import { join, extname } from 'path'
import * as dotenv from 'dotenv'
import https from 'https'
import { NodeHttpHandler } from '@smithy/node-http-handler'
import fs from 'fs'

dotenv.config()

const prisma = new PrismaClient()

// Load Zscaler cert for local dev (same pattern used in resend.ts)
const zscalerCert = (() => {
  const certPath = process.env.NODE_EXTRA_CA_CERTS
  if (!certPath) return undefined
  try { return fs.readFileSync(certPath) } catch { return undefined }
})()

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  requestHandler: zscalerCert
    ? new NodeHttpHandler({ httpsAgent: new https.Agent({ ca: zscalerCert }) })
    : undefined,
})

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

async function uploadFile(localPath: string, key: string): Promise<string> {
  const buf = await readFile(localPath)
  const ext = extname(localPath).toLowerCase()
  const contentType = MIME[ext] ?? 'application/octet-stream'
  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
    Body: buf,
    ContentType: contentType,
  }))
  return `${process.env.R2_PUBLIC_URL}/${key}`
}

async function main() {
  const uploadsDir = join(process.cwd(), 'public', 'uploads')

  // Migrate event images
  const events = await prisma.event.findMany({
    where: { image_url: { startsWith: '/uploads/' } },
    select: { id: true, image_url: true, name: true },
  })
  console.log(`Found ${events.length} event images to migrate`)
  for (const event of events) {
    const filename = event.image_url!.replace('/uploads/', '')
    const localPath = join(uploadsDir, filename)
    const key = `uploads/${filename}`
    try {
      const newUrl = await uploadFile(localPath, key)
      await prisma.event.update({ where: { id: event.id }, data: { image_url: newUrl } })
      console.log(`  ✓ ${event.name}: ${newUrl}`)
    } catch (e) {
      console.error(`  ✗ ${event.name}: ${e}`)
    }
  }

  // Migrate gallery photos (file_path field)
  const gallery = await prisma.galleryPhoto.findMany({
    where: { file_path: { startsWith: '/uploads/' } },
    select: { id: true, file_path: true },
  })
  console.log(`Found ${gallery.length} gallery photos to migrate`)
  for (const photo of gallery) {
    const filename = photo.file_path.replace('/uploads/', '')
    const localPath = join(uploadsDir, filename)
    const key = `uploads/${filename}`
    try {
      const newUrl = await uploadFile(localPath, key)
      await prisma.galleryPhoto.update({ where: { id: photo.id }, data: { file_path: newUrl } })
      console.log(`  ✓ gallery ${photo.id}: ${newUrl}`)
    } catch (e) {
      console.error(`  ✗ gallery ${photo.id}: ${e}`)
    }
  }

  // Migrate site images (file_path field)
  const siteImages = await prisma.siteImage.findMany({
    where: { file_path: { startsWith: '/uploads/' } },
    select: { id: true, file_path: true, slot: true },
  })
  console.log(`Found ${siteImages.length} site images to migrate`)
  for (const img of siteImages) {
    const filename = img.file_path.replace('/uploads/', '')
    const localPath = join(uploadsDir, filename)
    const key = `uploads/${filename}`
    try {
      const newUrl = await uploadFile(localPath, key)
      await prisma.siteImage.update({ where: { id: img.id }, data: { file_path: newUrl } })
      console.log(`  ✓ site image [${img.slot}]: ${newUrl}`)
    } catch (e) {
      console.error(`  ✗ site image [${img.slot}]: ${e}`)
    }
  }

  // Migrate hotel images
  const hotels = await prisma.hotel.findMany({
    where: { image_url: { startsWith: '/uploads/' } },
    select: { id: true, image_url: true, name: true },
  })
  console.log(`Found ${hotels.length} hotel images to migrate`)
  for (const hotel of hotels) {
    const filename = hotel.image_url!.replace('/uploads/', '')
    const localPath = join(uploadsDir, filename)
    const key = `uploads/${filename}`
    try {
      const newUrl = await uploadFile(localPath, key)
      await prisma.hotel.update({ where: { id: hotel.id }, data: { image_url: newUrl } })
      console.log(`  ✓ ${hotel.name}: ${newUrl}`)
    } catch (e) {
      console.error(`  ✗ ${hotel.name}: ${e}`)
    }
  }

  console.log('\nMigration complete.')
}

main().catch(console.error).finally(() => prisma.$disconnect())
