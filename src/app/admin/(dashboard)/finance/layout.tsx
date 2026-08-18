import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import FinanceCurrencyShell from './FinanceCurrencyShell'

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  const side = (session?.user.side ?? 'bride') as 'bride' | 'groom'

  return <FinanceCurrencyShell side={side}>{children}</FinanceCurrencyShell>
}
