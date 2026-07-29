import type { ReactNode } from 'react'

interface AuthBackdropProps {
  children: ReactNode
  /**
   * Show the oversized RYX wordmark behind the content. Defaults to true so the
   * auth screens keep their existing look; loading screens switch it off, where
   * it overpowered the small card in front of it.
   */
  showMark?: boolean
}

/**
 * AuthBackdrop — the branded #271E37 backdrop used by the auth screens:
 * radiating lines, a soft radial bloom, and the oversized RYX mark.
 *
 * Note on the RYX mark: "Lavishly Yours" is declared with `font-display: swap`,
 * so before that webfont finishes downloading the letters fall back to generic
 * `cursive` and render blocky. That is fine on screens reached after the app has
 * loaded (auth pages, OAuth callback), but it looks broken on first-paint
 * loading screens — which is why the route/boot loading states deliberately do
 * NOT use this component and stay on a plain background.
 *
 * Purely decorative: everything behind `children` is aria-hidden and
 * pointer-events-none, so it never intercepts clicks or reaches a screen reader.
 */
export default function AuthBackdrop({ children, showMark = true }: AuthBackdropProps) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#271E37] relative overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[1]" aria-hidden="true">
        {/* Radiating lines */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.08]" xmlns="http://www.w3.org/2000/svg">
          <line x1="50%" y1="50%" x2="0%" y2="20%" stroke="#a78bfa" strokeWidth="0.5" />
          <line x1="50%" y1="50%" x2="100%" y2="10%" stroke="#a78bfa" strokeWidth="0.5" />
          <line x1="50%" y1="50%" x2="100%" y2="50%" stroke="#a78bfa" strokeWidth="0.5" />
          <line x1="50%" y1="50%" x2="100%" y2="90%" stroke="#a78bfa" strokeWidth="0.5" />
          <line x1="50%" y1="50%" x2="0%" y2="80%" stroke="#a78bfa" strokeWidth="0.5" />
          <line x1="50%" y1="50%" x2="0%" y2="50%" stroke="#a78bfa" strokeWidth="0.5" />
          <line x1="50%" y1="50%" x2="30%" y2="0%" stroke="#a78bfa" strokeWidth="0.5" />
          <line x1="50%" y1="50%" x2="70%" y2="100%" stroke="#a78bfa" strokeWidth="0.5" />
          <line x1="50%" y1="50%" x2="20%" y2="100%" stroke="#a78bfa" strokeWidth="0.5" />
          <line x1="50%" y1="50%" x2="80%" y2="0%" stroke="#a78bfa" strokeWidth="0.5" />
        </svg>

        {/* Glow bloom */}
        <div
          className="absolute w-[700px] h-[700px] rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(90,50,200,0.12) 0%, rgba(60,20,140,0.05) 50%, transparent 75%)',
          }}
        />

        {/* The RYX mark — centered, compensating for the letter-spacing offset */}
        {showMark && (
          <span
            className="select-none leading-none whitespace-nowrap"
            style={{
              fontFamily: '"Lavishly Yours", cursive',
              fontSize: 'clamp(200px, 28vw, 420px)',
              fontWeight: '400',
              letterSpacing: '0.1em',
              marginRight: '-0.1em',
              color: 'rgba(160, 155, 170, 0.32)',
            }}
          >
            RYX
          </span>
        )}
      </div>

      <div className="relative z-10">{children}</div>
    </div>
  )
}
