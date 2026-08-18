import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const LANDMARKS = [
  { label: 'City Airport', address: 'City Airport, Your City, Your Country' },
  { label: 'Central Railway Station', address: 'Central Railway Station, Your City, Your Country' },
]

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'side_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const address = body?.address?.trim()
  if (!address) return NextResponse.json({ error: 'Address is required.' }, { status: 400 })

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Maps API not configured.' }, { status: 500 })

  const origins = encodeURIComponent(LANDMARKS.map((l) => l.address).join('|'))
  const destination = encodeURIComponent(address)
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origins}&destinations=${destination}&units=metric&key=${apiKey}`

  let data: {
    status: string
    rows: Array<{ elements: Array<{ status: string; distance: { text: string } }> }>
  }

  try {
    const res = await fetch(url)
    const raw = await res.text()
    data = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Failed to reach Google Maps API.' }, { status: 502 })
  }

  if (data.status !== 'OK') {
    return NextResponse.json({ error: `Maps API error: ${data.status}` }, { status: 502 })
  }

  const parts: string[] = []
  for (let i = 0; i < LANDMARKS.length; i++) {
    const el = data.rows[i]?.elements[0]
    if (el?.status === 'OK') {
      parts.push(`${el.distance.text} from ${LANDMARKS[i].label}`)
    }
  }

  if (parts.length === 0) {
    return NextResponse.json({ error: 'Could not calculate distances. Check the address.' }, { status: 422 })
  }

  return NextResponse.json({ distance_info: parts.join('\n') })
}
