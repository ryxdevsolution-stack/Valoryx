'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import LogoAnimation from '@/components/LogoAnimation'
import { useClient } from '@/contexts/ClientContext'

export default function Home() {
  const router = useRouter()
  const { isAuthenticated } = useClient()

  const handleAnimationComplete = () => {
    // After logo animation, redirect based on auth status
    if (isAuthenticated) {
      router.push('/dashboard')
    } else {
      router.push('/landing')
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <LogoAnimation onComplete={handleAnimationComplete} />
    </main>
  )
}
