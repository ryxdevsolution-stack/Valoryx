import { useCallback, useRef } from 'react'
import { Moon, Sun } from 'lucide-react'
import { flushSync } from 'react-dom'
import { useTheme } from '@/contexts/ThemeContext'

interface AnimatedThemeTogglerProps extends React.ComponentPropsWithoutRef<'button'> {
  /** Duration of the circular reveal animation in ms */
  duration?: number
  /** Size of the Sun/Moon icon (lucide-react size prop) */
  iconSize?: number
  /** lucide-react strokeWidth for the icon */
  iconStrokeWidth?: number
  /** Show a text label next to the icon (e.g. for mobile menus) */
  showLabel?: boolean
}

export function AnimatedThemeToggler({
  className = '',
  duration = 400,
  iconSize = 20,
  iconStrokeWidth = 2.5,
  showLabel = false,
  ...props
}: AnimatedThemeTogglerProps) {
  const { isDarkMode, toggleTheme } = useTheme()
  const buttonRef = useRef<HTMLButtonElement>(null)

  const handleToggle = useCallback(() => {
    const button = buttonRef.current
    if (!button) {
      toggleTheme()
      return
    }

    const { top, left, width, height } = button.getBoundingClientRect()
    const x = left + width / 2
    const y = top + height / 2
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight
    const maxRadius = Math.hypot(
      Math.max(x, viewportWidth - x),
      Math.max(y, viewportHeight - y),
    )

    // Fallback for browsers without View Transitions API
    if (typeof document.startViewTransition !== 'function') {
      toggleTheme()
      return
    }

    const transition = document.startViewTransition(() => {
      flushSync(() => {
        toggleTheme()
      })
    })

    const ready = transition?.ready
    if (ready && typeof ready.then === 'function') {
      ready.then(() => {
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${maxRadius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration,
            easing: 'ease-in-out',
            pseudoElement: '::view-transition-new(root)',
          },
        )
      })
    }
  }, [isDarkMode, duration, toggleTheme])

  return (
    <button
      type="button"
      ref={buttonRef}
      onClick={handleToggle}
      className={className}
      aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
      {...props}
    >
      {isDarkMode
        ? <Sun className="flex-shrink-0" style={{ width: iconSize, height: iconSize }} strokeWidth={iconStrokeWidth} />
        : <Moon className="flex-shrink-0" style={{ width: iconSize, height: iconSize }} strokeWidth={iconStrokeWidth} />
      }
      {showLabel && (
        <span className="text-sm font-medium">{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
      )}
    </button>
  )
}
