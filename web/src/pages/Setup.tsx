import { useAuth } from '../lib/auth'
import SetupDriver from './SetupDriver'
import SetupOwner from './SetupOwner'

export default function Setup() {
  const { profile } = useAuth()
  return profile?.role === 'driver' ? <SetupDriver /> : <SetupOwner />
}
