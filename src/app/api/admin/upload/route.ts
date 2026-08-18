import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { randomBytes } from 'crypto'
import { uploadToR2 } from '@/lib/r2'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_SIZE_BYTES = 4 * 1024 * 1024 // 4 MB (Vercel payload limit)

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'side_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const formData = await req.formData()
  const file = formData.get('file')

  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Only JPEG, PNG, WebP, and GIF images are allowed' }, { status: 400 })
  }

  const bytes = await file.arrayBuffer()
  if (bytes.byteLength > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'File must be under 4 MB' }, { status: 400 })
  }

  const ext = file.type.split('/')[1].replace('jpeg', 'jpg')
  const slot = (formData.get('slot') as string | null) ?? 'upload'
  const prefix = slot.replace(/[^a-z0-9]/gi, '-').toLowerCase().slice(0, 32)
  const key = `uploads/${prefix}-${randomBytes(8).toString('hex')}.${ext}`
  const url = await uploadToR2(key, Buffer.from(bytes), file.type)

  return NextResponse.json({ url }, { status: 201 })
}
