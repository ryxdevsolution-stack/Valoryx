import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import LogoAnimation from '@/components/LogoAnimation'
import { useClient } from '@/contexts/ClientContext'

export default function Home() {
  const navigate = useNavigate()
  const { isAuthenticated } = useClient()

  const handleAnimationComplete = () => {
    // After logo animation, redirect based on auth status
    if (isAuthenticated) {
      navigate('/dashboard')
    } else {
      navigate('/auth/login')
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <LogoAnimation onComplete={handleAnimationComplete} />
    </main>
  )
}
