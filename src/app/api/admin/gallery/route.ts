import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'side_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const photos = await prisma.galleryPhoto.findMany({ orderBy: { sort_order: 'asc' } })
  return NextResponse.json({ photos })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'side_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { file_path, alt_text, original_filename } = body

  if (!file_path) return NextResponse.json({ error: 'file_path is required' }, { status: 400 })

  const maxOrder = await prisma.galleryPhoto.aggregate({ _max: { sort_order: true } })
  const sort_order = (maxOrder._max.sort_order ?? 0) + 1

  const photo = await prisma.galleryPhoto.create({
    data: {
      file_path,
      alt_text: alt_text ?? null,
      original_filename: original_filename ?? null,
      sort_order,
    },
  })

  return NextResponse.json({ photo }, { status: 201 })
}
