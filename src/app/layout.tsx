import type { Metadata } from 'next'
import { Cormorant_Garamond, DM_Sans } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { prisma } from '@/lib/prisma'
import './globals.css'

const cormorant = Cormorant_Garamond({
  variable: '--font-cormorant',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
})

const dmSans = DM_Sans({
  variable: '--font-dm-sans',
  subsets: ['latin'],
})

export async function generateMetadata(): Promise<Metadata> {
  let s: Record<string, string> = {}
  try {
    const rows = await prisma.siteSettings.findMany()
    s = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  } catch {
    // DB unavailable at build time — use defaults
  }
  const title = s.couple_names ? `${s.couple_names} — Wedding` : 'Our Wedding'
  const description = s.wedding_city
    ? `Join us in ${s.wedding_city} to celebrate our wedding.`
    : 'You are invited to our wedding.'
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: s.hero_image ? [{ url: s.hero_image }] : [],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: s.hero_image ? [s.hero_image] : [],
    },
  }
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${cormorant.variable} ${dmSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Analytics />
      </body>
    </html>
  )
}
