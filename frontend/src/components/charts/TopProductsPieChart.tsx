'use client'

import { useRef } from 'react'
import Highcharts from 'highcharts'
import HighchartsReact from 'highcharts-react-official'
import { useTheme } from '@/contexts/ThemeContext'
import { getDarkModeChartOptions } from '@/lib/highcharts-config'

interface TopProductsPieChartProps {
  data: Array<{ product_name: string; revenue: number; quantity: number; category: string }>
  timeRange: 'today' | 'week' | 'month'
}

export default function TopProductsPieChart({ data, timeRange }: TopProductsPieChartProps) {
  const { isDarkMode } = useTheme()
  const chartRef = useRef<HighchartsReact.RefObject>(null)

  const getTitle = () => {
    if (timeRange === 'today') return 'Top 7 Products Today'
    if (timeRange === 'week') return 'Top 15 Products This Week'
    return 'Top 25 Products This Month'
  }

  const getTotalItems = () => {
    return data.reduce((sum, d) => sum + d.quantity, 0)
  }

  const options: Highcharts.Options = {
    ...getDarkModeChartOptions(isDarkMode),
    chart: {
      type: 'pie',
      backgroundColor: 'transparent',
      height: 350
    },
    title: {
      text: getTitle(),
      align: 'left',
      style: {
        fontSize: '16px',
        fontWeight: '600',
        color: isDarkMode ? '#f3f4f6' : '#1f2937'
      }
    },
    subtitle: {
      text: `${getTotalItems()} items • ₹${data.reduce((sum, d) => sum + d.revenue, 0).toLocaleString('en-IN')} revenue`,
      align: 'left',
      style: {
        fontSize: '12px',
        color: isDarkMode ? '#9ca3af' : '#666'
      }
    },
    tooltip: {
      backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
      borderColor: isDarkMode ? '#374151' : '#e5e7eb',
      borderRadius: 8,
      shadow: true,
      useHTML: true,
      formatter: function() {
        const point = (this as any).points[0] as any
        const textColor = isDarkMode ? '#f3f4f6' : '#1f2937'
        const secondaryColor = isDarkMode ? '#9ca3af' : '#666'
        return `
          <div style="padding: 8px;">
            <strong style="font-size: 13px; color: ${textColor};">${point.name}</strong><br/>
            <span style="color: ${point.color}; font-size: 12px;">●</span> Revenue: <strong style="color: ${textColor};">₹${point.y.toLocaleString('en-IN')}</strong><br/>
            <span style="font-size: 11px; color: ${secondaryColor};">Quantity: ${point.quantity}</span><br/>
            <span style="font-size: 11px; color: ${secondaryColor};">Share: ${point.percentage.toFixed(1)}%</span>
          </div>
        `
      }
    },
    plotOptions: {
      pie: {
        innerSize: '50%',
        borderRadius: 8,
        dataLabels: {
          enabled: true,
          format: '{point.name}',
          style: {
            fontSize: '10px',
            fontWeight: '600',
            textOutline: 'none',
            color: isDarkMode ? '#f3f4f6' : '#374151'
          },
          distance: 15,
          connectorWidth: 1,
          connectorColor: isDarkMode ? '#4b5563' : '#cbd5e1'
        },
        showInLegend: false,
        cursor: 'pointer',
        states: {
          hover: {
            brightness: 0.1
          }
        }
      }
    },
    credits: {
      enabled: false
    },
    series: [{
      type: 'pie',
      name: 'Revenue',
      data: data.map((item, index) => ({
        name: item.product_name,
        y: item.revenue,
        quantity: item.quantity,
        color: [
          '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
          '#06b6d4', '#6366f1', '#ef4444', '#14b8a6', '#f97316',
          '#a855f7', '#84cc16', '#22d3ee', '#f43f5e', '#eab308',
          '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ec4899',
          '#06b6d4', '#6366f1', '#ef4444', '#14b8a6', '#f97316'
        ][index % 25]
      }))
    }],
    responsive: {
      rules: [{
        condition: {
          maxWidth: 500
        },
        chartOptions: {
          chart: {
            height: 300
          },
          plotOptions: {
            pie: {
              dataLabels: {
                enabled: true,
                format: '',
                distance: -30,
                style: {
                  fontSize: '9px',
                  color: '#ffffff',
                  textOutline: '1px contrast'
                }
              }
            }
          }
        }
      }]
    }
  }

  return (
    <div className="w-full">
      <HighchartsReact highcharts={Highcharts} options={options} ref={chartRef} />
    </div>
  )
}
