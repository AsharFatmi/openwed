import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { deleteFromR2, keyFromUrl } from '@/lib/r2'

type Context = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, context: Context) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'side_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await context.params
  const body = await req.json()

  const data: Record<string, unknown> = {}
  if (body.alt_text !== undefined) data.alt_text = body.alt_text?.trim() || null
  if (body.sort_order !== undefined) data.sort_order = Number(body.sort_order)

  const photo = await prisma.galleryPhoto.update({ where: { id }, data })
  return NextResponse.json({ photo })
}

export async function DELETE(_req: NextRequest, context: Context) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'side_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await context.params

  const photo = await prisma.galleryPhoto.findUnique({ where: { id } })
  if (!photo) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.galleryPhoto.delete({ where: { id } })

  // Best-effort R2 deletion
  try {
    await deleteFromR2(keyFromUrl(photo.file_path))
  } catch {
    // Ignore — file may have already been removed
  }

  return NextResponse.json({ deleted: true })
}
