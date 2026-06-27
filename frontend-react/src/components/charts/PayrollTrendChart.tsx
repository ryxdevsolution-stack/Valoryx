import Highcharts from 'highcharts'
import HighchartsReact from 'highcharts-react-official'
import { useTheme } from '@/contexts/ThemeContext'
import { getDarkModeChartOptions } from '@/lib/highcharts-config'
import { useCurrency } from '@/lib/useCurrency'

export interface PayrollTrendPoint {
  month: string         // '2026-04'
  label: string         // 'Apr 2026'
  gross_earned: number  // Attendance-derived gross (true payroll cost)
  advances_paid: number // Advances disbursed in the month
  net_paid: number      // Positive net_salary from paid cycles
  cash_out: number      // advances_paid + net_paid (total money disbursed)
  cycles_paid: number   // count of cycles marked paid that month
  // Back-compat legacy fields — kept so older callers don't break
  paid: number
  gross: number
}

interface PayrollTrendChartProps {
  data: PayrollTrendPoint[]
}

export default function PayrollTrendChart({ data }: PayrollTrendChartProps) {
  const { isDarkMode } = useTheme()
  const { symbol: cur } = useCurrency()

  const options: Highcharts.Options = {
    ...getDarkModeChartOptions(isDarkMode),
    chart: {
      type: 'column',
      backgroundColor: 'transparent',
      height: 280,
      animation: { duration: 500 },
    },
    title: { text: undefined },
    xAxis: {
      categories: data.map(d => d.label),
      gridLineColor: isDarkMode ? '#374151' : undefined,
      lineColor: isDarkMode ? '#374151' : undefined,
      tickColor: isDarkMode ? '#374151' : undefined,
      labels: { style: { color: isDarkMode ? '#9ca3af' : '#6b7280', fontSize: '11px' } },
    },
    yAxis: {
      min: 0,
      floor: 0,      // Hard floor — clamp axis to non-negative even if data provides negatives
      startOnTick: true,
      title: { text: `Payroll (${cur})`, style: { color: isDarkMode ? '#9ca3af' : '#6b7280', fontSize: '11px' } },
      gridLineColor: isDarkMode ? '#374151' : '#e5e7eb',
      labels: {
        formatter: function () {
          const v = Number(this.value)
          if (v >= 100000) return `${cur}${(v / 100000).toFixed(1)}L`
          if (v >= 1000) return `${cur}${(v / 1000).toFixed(0)}k`
          return `${cur}${v}`
        },
        style: { color: isDarkMode ? '#9ca3af' : '#6b7280', fontSize: '11px' },
      },
    },
    tooltip: {
      shared: true,
      backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
      borderColor: isDarkMode ? '#374151' : '#e5e7eb',
      style: { color: isDarkMode ? '#f3f4f6' : '#111827' },
      formatter: function () {
        const points = (this as unknown as { points?: Array<{ point: { index: number } }> }).points
        const idx = points?.[0]?.point?.index ?? 0
        const row = data[idx]
        if (!row) return ''
        const fmt = (n: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)
        return (
          `<b>${row.label}</b><br/>` +
          `<span style="color:#6366f1">■</span> Gross Earned: <b>${cur}${fmt(row.gross_earned)}</b><br/>` +
          `<span style="color:#f59e0b">●</span> Advances Paid: <b>${cur}${fmt(row.advances_paid)}</b><br/>` +
          `<span style="color:#10b981">●</span> Salary Paid: <b>${cur}${fmt(row.net_paid)}</b><br/>` +
          `<span style="opacity:0.7">Cycles closed: ${row.cycles_paid}</span>`
        )
      },
    },
    credits: { enabled: false },
    legend: {
      enabled: true,
      align: 'right',
      verticalAlign: 'top',
      itemStyle: { color: isDarkMode ? '#d1d5db' : '#4b5563', fontSize: '11px', fontWeight: '500' },
      itemHoverStyle: { color: isDarkMode ? '#ffffff' : '#111827' },
      symbolRadius: 2,
    },
    plotOptions: {
      column: {
        borderRadius: 4,
        borderWidth: 0,
        pointPadding: 0.12,
        groupPadding: 0.08,
        states: { hover: { brightness: 0.08 } },
      },
      line: {
        marker: {
          enabled: true,
          radius: 4,
          lineWidth: 2,
          lineColor: '#ffffff',
        },
        lineWidth: 2.5,
      },
    },
    series: [
      {
        // Bars = GROSS EARNED — computed from employee_attendance.
        // Always ≥ 0. This is "what employees deserve to be paid" = true cost.
        type: 'column',
        name: 'Gross Earned',
        data: data.map(d => Math.max(0, d.gross_earned)),
        color: {
          linearGradient: { x1: 0, x2: 0, y1: 0, y2: 1 },
          stops: [
            [0, '#6366f1'], // indigo-500
            [1, '#4338ca'], // indigo-700
          ],
        },
        dataLabels: {
          enabled: true,
          formatter: function () {
            const v = Number(this.y ?? 0)
            if (v === 0) return ''
            if (v >= 100000) return `${cur}${(v / 100000).toFixed(1)}L`
            if (v >= 1000) return `${cur}${(v / 1000).toFixed(0)}k`
            return `${cur}${v}`
          },
          style: {
            fontSize: '10px',
            fontWeight: '600',
            color: isDarkMode ? '#e5e7eb' : '#374151',
            textOutline: 'none',
          },
        },
      },
      {
        // Line 1 = ADVANCES — money disbursed mid-cycle. Amber, stands out.
        type: 'line',
        name: 'Advances Paid',
        data: data.map(d => Math.max(0, d.advances_paid)),
        color: '#f59e0b', // amber-500
        dashStyle: 'Solid',
      },
      {
        // Line 2 = SALARY PAID — positive net from closed cycles. Green.
        // Different line style (Dash) so it's distinguishable from Advances
        // even in monochrome / low-vision screen conditions.
        type: 'line',
        name: 'Salary Paid',
        data: data.map(d => Math.max(0, d.net_paid)),
        color: '#10b981', // emerald-500
        dashStyle: 'ShortDash',
      },
    ],
  }

  return (
    <div className="w-full">
      <HighchartsReact highcharts={Highcharts} options={options} />
    </div>
  )
}
