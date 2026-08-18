import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { randomBytes } from 'crypto'
import { getPresignedUploadUrl } from '@/lib/r2'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'side_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = req.nextUrl
  const contentType = searchParams.get('contentType') ?? ''
  const slot = searchParams.get('slot') ?? 'upload'
  const filename = searchParams.get('filename') ?? ''

  if (!ALLOWED_TYPES.includes(contentType)) {
    return NextResponse.json({ error: 'Only JPEG, PNG, WebP, and GIF images are allowed' }, { status: 400 })
  }

  const rawExt = filename.split('.').pop()?.toLowerCase() ?? ''
  const ext = contentType === 'image/jpeg' ? 'jpg' : (rawExt || contentType.split('/')[1])
  const prefix = slot.replace(/[^a-z0-9]/gi, '-').toLowerCase().slice(0, 32)
  const key = `uploads/${prefix}-${randomBytes(8).toString('hex')}.${ext}`

  const uploadUrl = await getPresignedUploadUrl(key, contentType)
  const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`

  return NextResponse.json({ uploadUrl, publicUrl })
}
