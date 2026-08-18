import { Role, Side } from '@prisma/client'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      name: string
      email: string
      role: Role
      side: Side | null
    }
  }

  interface User {
    id: string
    name: string
    email: string
    role: Role
    side: Side | null
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: Role
    side: Side | null
  }
}
