import crypto from 'crypto'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const guests = await prisma.guest.findMany({
    where: { rsvp_token: null },
    select: { id: true },
  })

  console.log(`Found ${guests.length} guests without a token.`)

  for (const g of guests) {
    const token = crypto.randomBytes(32).toString('hex')
    await prisma.guest.update({ where: { id: g.id }, data: { rsvp_token: token } })
  }

  console.log('Done.')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
