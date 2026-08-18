// Google Maps Distance Matrix API helper
// Called server-side only when the user's message is about distances/travel

const DISTANCE_KEYWORDS = [
  'uber', 'ola', 'cab', 'taxi', 'distance', 'how far', 'far from', 'far is',
  'travel time', 'drive', 'driving', 'directions', 'route', 'map', 'minutes from',
  'minutes away', 'km from', 'get to', 'reach', 'commute',
]

export function isDistanceQuery(text: string): boolean {
  const lower = text.toLowerCase()
  return DISTANCE_KEYWORDS.some((kw) => lower.includes(kw))
}

interface DistanceResult {
  origin: string
  destination: string
  distance: string   // e.g. "8.2 km"
  duration: string   // e.g. "22 mins"
}

async function getDistance(
  origin: string,
  destination: string,
  apiKey: string
): Promise<DistanceResult | null> {
  const params = new URLSearchParams({
    origins: origin,
    destinations: destination,
    mode: 'driving',
    key: apiKey,
  })
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?${params}`

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
    const data = await res.json() as {
      rows?: { elements?: { status: string; distance?: { text: string }; duration?: { text: string } }[] }[]
    }
    const el = data.rows?.[0]?.elements?.[0]
    if (!el || el.status !== 'OK') return null
    return {
      origin,
      destination,
      distance: el.distance?.text ?? '',
      duration: el.duration?.text ?? '',
    }
  } catch {
    return null
  }
}

export async function fetchTravelContext(
  venues: { name: string; address: string }[],
  hotels: { name: string; address: string }[]
): Promise<string> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey || venues.length === 0 || hotels.length === 0) return ''

  // Build pairs: each venue ↔ each hotel, plus venue ↔ venue
  const pairs: { origin: string; destination: string; label: string }[] = []

  for (const venue of venues) {
    for (const hotel of hotels) {
      if (!venue.address || !hotel.address) continue
      pairs.push({
        origin: venue.address,
        destination: hotel.address,
        label: `${venue.name} → ${hotel.name}`,
      })
    }
  }

  // venue ↔ venue pairs
  for (let i = 0; i < venues.length; i++) {
    for (let j = i + 1; j < venues.length; j++) {
      if (!venues[i].address || !venues[j].address) continue
      pairs.push({
        origin: venues[i].address,
        destination: venues[j].address,
        label: `${venues[i].name} → ${venues[j].name}`,
      })
    }
  }

  if (pairs.length === 0) return ''

  // Fetch all in parallel, cap at 10 pairs to stay within rate limits
  const results = await Promise.all(
    pairs.slice(0, 10).map((p) => getDistance(p.origin, p.destination, apiKey))
  )

  const lines: string[] = []
  results.forEach((r, i) => {
    if (r) {
      lines.push(`${pairs[i].label}: ${r.distance}, ~${r.duration} by car`)
    }
  })

  if (lines.length === 0) return ''
  return `\n\n## Live Travel Distances (Google Maps)\n${lines.join('\n')}`
}
