'use client'

import { useEffect, useRef, useCallback } from 'react'
import { motion, useMotionValue, useSpring } from 'framer-motion'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  opacity: number
  color: string
  life: number
  maxLife: number
}

interface MouseParticlesProps {
  count?: number
  colors?: string[]
  className?: string
  interactive?: boolean
  connectionDistance?: number
  particleSize?: { min: number; max: number }
}

export default function MouseParticles({
  count = 50,
  colors = ['#0ea5e9', '#8b5cf6', '#06b6d4', '#3b82f6', '#a855f7'],
  className = '',
  interactive = true,
  connectionDistance = 150,
  particleSize = { min: 2, max: 5 },
}: MouseParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const mouseRef = useRef({ x: 0, y: 0 })
  const animationRef = useRef<number>()

  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)
  const smoothMouseX = useSpring(mouseX, { stiffness: 50, damping: 20 })
  const smoothMouseY = useSpring(mouseY, { stiffness: 50, damping: 20 })

  const initParticles = useCallback((width: number, height: number) => {
    const particles: Particle[] = []
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        size: Math.random() * (particleSize.max - particleSize.min) + particleSize.min,
        opacity: Math.random() * 0.5 + 0.2,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: Math.random() * 100,
        maxLife: 100 + Math.random() * 100,
      })
    }
    return particles
  }, [count, colors, particleSize])

  const drawParticle = useCallback((ctx: CanvasRenderingContext2D, particle: Particle) => {
    ctx.beginPath()
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2)
    ctx.fillStyle = particle.color
    ctx.globalAlpha = particle.opacity
    ctx.fill()
    ctx.globalAlpha = 1
  }, [])

  const drawConnections = useCallback((
    ctx: CanvasRenderingContext2D,
    particles: Particle[],
    mousePos: { x: number; y: number }
  ) => {
    for (let i = 0; i < particles.length; i++) {
      // Connect to mouse
      if (interactive) {
        const dxMouse = particles[i].x - mousePos.x
        const dyMouse = particles[i].y - mousePos.y
        const distMouse = Math.sqrt(dxMouse * dxMouse + dyMouse * dyMouse)

        if (distMouse < connectionDistance * 1.5) {
          ctx.beginPath()
          ctx.moveTo(particles[i].x, particles[i].y)
          ctx.lineTo(mousePos.x, mousePos.y)
          ctx.strokeStyle = particles[i].color
          ctx.globalAlpha = (1 - distMouse / (connectionDistance * 1.5)) * 0.3
          ctx.lineWidth = 1
          ctx.stroke()
          ctx.globalAlpha = 1
        }
      }

      // Connect particles to each other
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x
        const dy = particles[i].y - particles[j].y
        const dist = Math.sqrt(dx * dx + dy * dy)

        if (dist < connectionDistance) {
          ctx.beginPath()
          ctx.moveTo(particles[i].x, particles[i].y)
          ctx.lineTo(particles[j].x, particles[j].y)
          ctx.strokeStyle = particles[i].color
          ctx.globalAlpha = (1 - dist / connectionDistance) * 0.15
          ctx.lineWidth = 0.5
          ctx.stroke()
          ctx.globalAlpha = 1
        }
      }
    }
  }, [interactive, connectionDistance])

  const updateParticle = useCallback((
    particle: Particle,
    width: number,
    height: number,
    mousePos: { x: number; y: number }
  ) => {
    // Mouse interaction - particles are attracted/repelled by mouse
    if (interactive && mousePos.x > 0 && mousePos.y > 0) {
      const dx = mousePos.x - particle.x
      const dy = mousePos.y - particle.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < 200) {
        const force = (200 - dist) / 200
        particle.vx += (dx / dist) * force * 0.02
        particle.vy += (dy / dist) * force * 0.02
      }
    }

    // Apply velocity with damping
    particle.x += particle.vx
    particle.y += particle.vy
    particle.vx *= 0.99
    particle.vy *= 0.99

    // Boundary collision
    if (particle.x < 0 || particle.x > width) {
      particle.vx *= -1
      particle.x = Math.max(0, Math.min(width, particle.x))
    }
    if (particle.y < 0 || particle.y > height) {
      particle.vy *= -1
      particle.y = Math.max(0, Math.min(height, particle.y))
    }

    // Pulsing opacity
    particle.life += 1
    if (particle.life > particle.maxLife) {
      particle.life = 0
    }
    const pulse = Math.sin((particle.life / particle.maxLife) * Math.PI * 2)
    particle.opacity = 0.2 + pulse * 0.3

    return particle
  }, [interactive])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resizeCanvas = () => {
      const rect = canvas.parentElement?.getBoundingClientRect()
      if (rect) {
        canvas.width = rect.width
        canvas.height = rect.height
        particlesRef.current = initParticles(rect.width, rect.height)
      }
    }

    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      }
      mouseX.set(e.clientX - rect.left)
      mouseY.set(e.clientY - rect.top)
    }

    canvas.addEventListener('mousemove', handleMouseMove)

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const mousePos = {
        x: smoothMouseX.get(),
        y: smoothMouseY.get(),
      }

      // Update and draw particles
      particlesRef.current = particlesRef.current.map((particle) =>
        updateParticle(particle, canvas.width, canvas.height, mousePos)
      )

      // Draw connections first (behind particles)
      drawConnections(ctx, particlesRef.current, mousePos)

      // Draw particles
      particlesRef.current.forEach((particle) => {
        drawParticle(ctx, particle)
      })

      animationRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.removeEventListener('resize', resizeCanvas)
      canvas.removeEventListener('mousemove', handleMouseMove)
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [initParticles, drawParticle, drawConnections, updateParticle, mouseX, mouseY, smoothMouseX, smoothMouseY])

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 pointer-events-auto ${className}`}
      style={{ zIndex: 0 }}
    />
  )
}

// Floating cursor glow effect
export function CursorGlow() {
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)
  const smoothX = useSpring(mouseX, { stiffness: 100, damping: 30 })
  const smoothY = useSpring(mouseY, { stiffness: 100, damping: 30 })

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set(e.clientX)
      mouseY.set(e.clientY)
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [mouseX, mouseY])

  return (
    <motion.div
      className="fixed pointer-events-none z-50"
      style={{
        x: smoothX,
        y: smoothY,
        translateX: '-50%',
        translateY: '-50%',
      }}
    >
      <div className="w-96 h-96 rounded-full bg-gradient-to-r from-primary-500/20 via-purple-500/20 to-cyan-500/20 blur-3xl" />
    </motion.div>
  )
}
