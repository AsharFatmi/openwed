import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const email = process.env.SUPER_ADMIN_EMAIL ?? 'super@admin.com'
  const password = process.env.SUPER_ADMIN_PASSWORD ?? 'SuperAdmin123!'

  const passwordHash = await bcrypt.hash(password, 12)

  await prisma.adminUser.upsert({
    where: { email },
    update: {},
    create: {
      email,
      password_hash: passwordHash,
      name: 'Super Admin',
      role: 'super_admin',
      side: null,
      active: true,
    },
  })

  console.log(`Seeding complete — super admin: ${email}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
