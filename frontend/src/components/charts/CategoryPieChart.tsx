'use client'

import { useRef } from 'react'
import Highcharts from 'highcharts'
import HighchartsReact from 'highcharts-react-official'
import { useTheme } from '@/contexts/ThemeContext'
import { getDarkModeChartOptions } from '@/lib/highcharts-config'

interface CategoryPieChartProps {
  data: Array<{ category: string; revenue: number; items_sold: number }>
}

export default function CategoryPieChart({ data }: CategoryPieChartProps) {
  const chartRef = useRef<HighchartsReact.RefObject>(null)
  const { isDarkMode } = useTheme()

  const options: Highcharts.Options = {
    ...getDarkModeChartOptions(isDarkMode),
    chart: {
      type: 'pie',
      backgroundColor: 'transparent',
      height: 300
    },
    title: {
      text: 'Sales by Category',
      align: 'left',
      style: {
        fontSize: '16px',
        fontWeight: '600',
        color: isDarkMode ? '#f3f4f6' : undefined
      }
    },
    subtitle: {
      text: `${data.reduce((sum, d) => sum + d.items_sold, 0)} items sold`,
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
      style: {
        color: isDarkMode ? '#f3f4f6' : undefined
      },
      formatter: function() {
        const point = (this as any).points[0] as any
        const textColor = isDarkMode ? '#f3f4f6' : '#000'
        const metaColor = isDarkMode ? '#9ca3af' : '#666'
        return `
          <div style="padding: 8px;">
            <strong style="font-size: 13px; color: ${textColor};">${point.name}</strong><br/>
            <span style="color: ${point.color}; font-size: 12px;">●</span> Revenue: <strong style="color: ${textColor};">₹${point.y.toLocaleString('en-IN')}</strong><br/>
            <span style="font-size: 11px; color: ${metaColor};">Items: ${point.items_sold}</span><br/>
            <span style="font-size: 11px; color: ${metaColor};">Share: ${point.percentage.toFixed(1)}%</span>
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
          format: '{point.name}: {point.percentage:.1f}%',
          style: {
            fontSize: '11px',
            fontWeight: '600',
            textOutline: 'none'
          },
          distance: 10
        },
        showInLegend: true
      }
    },
    legend: {
      align: 'right',
      verticalAlign: 'middle',
      layout: 'vertical',
      itemStyle: {
        fontSize: '11px',
        color: isDarkMode ? '#f3f4f6' : undefined
      },
      itemHoverStyle: {
        color: isDarkMode ? '#ffffff' : undefined
      }
    },
    credits: {
      enabled: false
    },
    series: [{
      type: 'pie',
      name: 'Revenue',
      data: data.map(item => ({
        name: item.category || 'Uncategorized',
        y: item.revenue,
        items_sold: item.items_sold
      })),
      colors: [
        '#3b82f6',
        '#8b5cf6',
        '#ec4899',
        '#f59e0b',
        '#10b981',
        '#06b6d4',
        '#6366f1'
      ]
    }],
    responsive: {
      rules: [{
        condition: {
          maxWidth: 500
        },
        chartOptions: {
          chart: {
            height: 250
          },
          legend: {
            align: 'center',
            verticalAlign: 'bottom',
            layout: 'horizontal'
          },
          plotOptions: {
            pie: {
              dataLabels: {
                enabled: false
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
