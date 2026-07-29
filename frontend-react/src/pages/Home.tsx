import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import LogoAnimation from '@/components/LogoAnimation'
import LoadingScreen from '@/components/LoadingScreen'
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
        navigate('/landing', { replace: true })
      }
    }
  }, [isLoading, isAuthenticated, navigate])

  const handleAnimationComplete = () => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true })
    } else {
      navigate('/landing', { replace: true })
    }
  }

  // Shared loading view while auth resolves — no flash of light background, and
  // no bare #271E37 div, which was pixel-identical to a crashed app with an
  // empty #root and made "blank purple screen" reports impossible to diagnose.
  if (isLoading) {
    return <LoadingScreen />
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#271E37]">
      <LogoAnimation onComplete={handleAnimationComplete} />
    </main>
  )
}
