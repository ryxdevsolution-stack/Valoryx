import { memo, useMemo } from 'react'

interface BillItem {
  product_id: string
  product_name: string
  quantity: number
  rate: number
  cost_price?: number
}

interface ProfitSummaryBarProps {
  items: BillItem[]
  userRole: string
}

function ProfitSummaryBar({ items, userRole }: ProfitSummaryBarProps) {
  if (!['owner', 'manager', 'admin'].includes(userRole)) return null
  if (items.length === 0) return null

  const { totalCost, totalRevenue, profit, margin, hasCostData } = useMemo(() => {
    const cost = items.reduce((sum, item) => {
      return sum + Number(item.cost_price || 0) * item.quantity
    }, 0)

    const revenue = items.reduce((sum, item) => {
      return sum + item.rate * item.quantity
    }, 0)

    const p = revenue - cost
    const m = revenue > 0 ? (p / revenue) * 100 : 0
    const hasData = items.some(item => item.cost_price && Number(item.cost_price) > 0)

    return { totalCost: cost, totalRevenue: revenue, profit: p, margin: m, hasCostData: hasData }
  }, [items])

  if (!hasCostData) return null

  return (
    <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 mt-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <div className="flex items-center gap-1">
          <span className="text-gray-500 dark:text-gray-400">Cost:</span>
          <span className="font-semibold text-gray-700 dark:text-gray-300">
            ₹{totalCost.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-gray-500 dark:text-gray-400">Revenue:</span>
          <span className="font-semibold text-gray-700 dark:text-gray-300">
            ₹{totalRevenue.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-gray-500 dark:text-gray-400">Profit:</span>
          <span className={`font-bold ${profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            ₹{profit.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-gray-500 dark:text-gray-400">Margin:</span>
          <span className={`font-bold ${margin >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {margin.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  )
}

export default memo(ProfitSummaryBar)
