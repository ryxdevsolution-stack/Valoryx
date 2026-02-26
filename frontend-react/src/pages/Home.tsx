import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import LogoAnimation from '@/components/LogoAnimation'
import { useClient } from '@/contexts/ClientContext'

export default function Home() {
  const navigate = useNavigate()
  const { isAuthenticated, isLoading } = useClient()

  // Once auth state is resolved, redirect immediately without animation delay
  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        navigate('/dashboard', { replace: true })
      } else {
        navigate('/auth/login', { replace: true })
      }
    }
  }, [isLoading, isAuthenticated, navigate])

  const handleAnimationComplete = () => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true })
    } else {
      navigate('/auth/login', { replace: true })
    }
  }

  // Show dark background while auth is resolving (no flash of light background)
  if (isLoading) {
    return <div className="min-h-screen bg-[#271E37]" />
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#271E37]">
      <LogoAnimation onComplete={handleAnimationComplete} />
    </main>
  )
}
