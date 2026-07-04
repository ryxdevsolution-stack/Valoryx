import { motion } from 'framer-motion'
import { useCurrency } from '@/lib/useCurrency'

interface ProfitabilityTierBarProps {
  profitMargin: number
  totalProfit: number
}

// Tier definitions — sum of widths must equal 100. Order matters: left-to-right.
const TIERS = [
  { key: 'low',    label: 'Low',       range: [0, 15],   color: 'bg-red-500',    textColor: 'text-red-600 dark:text-red-400',    width: 15 },
  { key: 'avg',    label: 'Average',   range: [15, 25],  color: 'bg-orange-500', textColor: 'text-orange-600 dark:text-orange-400', width: 10 },
  { key: 'good',   label: 'Good',      range: [25, 40],  color: 'bg-blue-500',   textColor: 'text-blue-600 dark:text-blue-400',   width: 15 },
  // The "Excellent" tier is the open-ended top band. We cap the visual axis at 50%
  // so margins above 50 still render sensibly — real-world margins rarely exceed
  // this and clamping prevents the marker from running off the right edge.
  { key: 'great',  label: 'Excellent', range: [40, 50],  color: 'bg-green-500',  textColor: 'text-green-600 dark:text-green-400', width: 60 },
] as const

const VISUAL_AXIS_MAX = 50 // % — anything above this pins the marker to the right edge

function currentTier(margin: number) {
  if (margin >= 40) return TIERS[3]
  if (margin >= 25) return TIERS[2]
  if (margin >= 15) return TIERS[1]
  return TIERS[0]
}

export default function ProfitabilityTierBar({ profitMargin, totalProfit }: ProfitabilityTierBarProps) {
  const { symbol, locale } = useCurrency()
  const fmtProfit = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 0 })
  const tier = currentTier(profitMargin)
  // Clamp the marker to the visual axis so extreme values stay on-chart
  const markerPct = Math.max(0, Math.min(profitMargin, VISUAL_AXIS_MAX))
  const markerLeft = (markerPct / VISUAL_AXIS_MAX) * 100

  // Distance to next tier (if any) — gives the user a concrete "how much more to reach X"
  const nextTier =
    profitMargin < 15  ? { name: 'Average',   threshold: 15 } :
    profitMargin < 25  ? { name: 'Good',      threshold: 25 } :
    profitMargin < 40  ? { name: 'Excellent', threshold: 40 } :
    null
  const distanceToNext = nextTier ? nextTier.threshold - profitMargin : 0

  return (
    // justify-between pushes the header to the top, the "next tier" hint to
    // the bottom, and distributes extra vertical space evenly between them —
    // so when the parent grid stretches this card, it still looks intentional.
    <div className="flex flex-col h-full justify-between gap-4">
      {/* Header: big number + margin pill + tier */}
      <div className="flex items-baseline justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Profitability</h3>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {symbol}{fmtProfit(totalProfit)}
            <span className={`text-sm font-semibold ml-2 ${tier.textColor}`}>
              {profitMargin.toFixed(1)}%
            </span>
          </p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Total profit · {profitMargin.toFixed(1)}% margin
          </p>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-1 rounded-full uppercase tracking-wide ${tier.color} text-white`}>
          {tier.label}
        </span>
      </div>

      {/* Tier bar — the actual visualization. Each segment shows its tier in its
          tier color; the marker sits at the current margin's x position. */}
      <div className="relative">
        <div className="flex h-5 rounded-md overflow-hidden shadow-inner" role="img" aria-label={`Profit margin ${profitMargin.toFixed(1)}%, ${tier.label} tier`}>
          {TIERS.map(t => (
            <div
              key={t.key}
              className={`${t.color} ${t.key === tier.key ? 'opacity-100' : 'opacity-30'} transition-opacity`}
              style={{ width: `${t.width}%` }}
            />
          ))}
        </div>

        {/* Marker triangle above the bar, animated into position */}
        <motion.div
          initial={{ left: 0, opacity: 0 }}
          animate={{ left: `${markerLeft}%`, opacity: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="absolute top-0 -translate-x-1/2 -translate-y-full pt-0.5"
        >
          <div className="flex flex-col items-center">
            <span className={`text-[10px] font-bold ${tier.textColor} whitespace-nowrap`}>
              {profitMargin.toFixed(1)}%
            </span>
            <svg width="10" height="6" viewBox="0 0 10 6" className="mt-0.5">
              <path d="M5 6 L0 0 L10 0 Z" className={tier.textColor.replace('text-', 'fill-')} />
            </svg>
          </div>
        </motion.div>

        {/* Tier scale labels below the bar */}
        <div className="flex mt-2 text-[9px] text-gray-500 dark:text-gray-400">
          {TIERS.map(t => (
            <div
              key={t.key}
              className="text-center"
              style={{ width: `${t.width}%` }}
            >
              <span className="block">{t.range[0]}%</span>
            </div>
          ))}
          <span className="absolute right-0 text-[9px] text-gray-400" style={{ bottom: '-14px' }}>
            {VISUAL_AXIS_MAX}%+
          </span>
        </div>
      </div>

      {/* Contextual footer — "how far to the next tier" */}
      <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
        {nextTier ? (
          <p className="text-xs text-gray-600 dark:text-gray-400">
            <span className={`font-semibold ${tier.textColor}`}>+{distanceToNext.toFixed(1)}%</span>{' '}
            more to reach the <span className="font-semibold">{nextTier.name}</span> tier.
          </p>
        ) : (
          <p className="text-xs text-green-600 dark:text-green-400 font-medium">
            Top tier — excellent margin.
          </p>
        )}
      </div>
    </div>
  )
}
