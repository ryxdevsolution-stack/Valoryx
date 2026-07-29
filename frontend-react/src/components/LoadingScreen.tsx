import AuthBackdrop from '@/components/AuthBackdrop'
import { APP_CONFIG } from '@/config'

interface LoadingScreenProps {
  /** Status line under the spinner. Defaults to a neutral "Loading…". */
  message?: string
  /** 0-100 progress bar; -1 renders an error tint; omit to hide the bar. */
  progress?: number
}

/**
 * LoadingScreen — the single loading view for every pre-app state: the Electron
 * backend splash, the router's lazy-chunk fallback, and Home while auth resolves.
 *
 * Layout is the same idea as the login page: the branded RYX backdrop behind,
 * and a translucent glass card in front. The card's `backdrop-blur-md` is what
 * softens the RYX mark behind it, so the text reads as a watermark rather than
 * competing with the content.
 *
 * One component for all three states so they can never drift apart again — a
 * plain purple loading screen used to be indistinguishable from a crashed app.
 */
export default function LoadingScreen({ message, progress }: LoadingScreenProps) {
  const isError = progress === -1
  const showBar = typeof progress === 'number' && progress >= 0

  return (
    // showMark={false}: the giant RYX wordmark overpowered the small card and
    // left the screen busy. Loading keeps only the radiating lines and glow —
    // enough to stay on-brand without competing for attention.
    <AuthBackdrop showMark={false}>
      <div className="w-full max-w-sm px-4">
        {/* No logo image either: at 64px it read as a speck and broke the
            card's balance. The wordmark below carries the branding. */}
        <div className="backdrop-blur-md rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] border border-white/10 bg-white/5 px-8 py-9 text-center">
          {/* Hierarchy comes from size + spacing, on an 8pt rhythm:
              wordmark (24px) → tagline (13px, 8px gap) → status group (32px gap). */}
          <h1 className="text-2xl font-bold text-white tracking-tight">{APP_CONFIG.name}</h1>
          <p className="mt-2 text-[13px] leading-snug text-slate-400">{APP_CONFIG.tagline}</p>

          {showBar && (
            <div className="mt-8 h-[3px] w-full rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#5227FF] to-[#a78bfa] transition-[width] duration-500 ease-out motion-reduce:transition-none"
                style={{ width: `${Math.min(100, progress)}%` }}
              />
            </div>
          )}

          <div
            className={`${showBar ? 'mt-6' : 'mt-8'} flex flex-col items-center gap-3`}
            role="status"
            aria-live="polite"
          >
            {!isError && (
              // motion-reduce keeps the ring visible but static for users who
              // opt out of animation, rather than removing the indicator.
              <div className="w-8 h-8 border-2 border-[#5227FF] border-t-transparent rounded-full animate-spin motion-reduce:animate-none" />
            )}
            <span className={`text-sm tracking-wide ${isError ? 'text-red-400' : 'text-slate-400'}`}>
              {message || 'Loading…'}
            </span>
          </div>
        </div>
      </div>
    </AuthBackdrop>
  )
}
