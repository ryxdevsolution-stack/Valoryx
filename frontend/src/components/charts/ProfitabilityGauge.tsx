'use client'

import { useRef, useEffect, useState } from 'react'
import { initializeHighcharts } from '@/lib/highcharts-config'
import { getDarkModeChartOptions } from '@/lib/highcharts-config'
import { useTheme } from '@/contexts/ThemeContext'
import HighchartsReact from 'highcharts-react-official'

interface ProfitabilityGaugeProps {
  profitMargin: number
  totalProfit: number
}

export default function ProfitabilityGauge({ profitMargin, totalProfit }: ProfitabilityGaugeProps) {
  const { isDarkMode } = useTheme()
  const chartRef = useRef<HighchartsReact.RefObject>(null)
  const [Highcharts, setHighcharts] = useState<any>(null)

  useEffect(() => {
    // Initialize Highcharts with modules on client side
    const hc = initializeHighcharts()
    setHighcharts(hc)
  }, [])

  // Determine color based on profit margin
  const getColor = (margin: number) => {
    if (margin >= 40) return '#10b981' // Green - Excellent
    if (margin >= 25) return '#3b82f6' // Blue - Good
    if (margin >= 15) return '#f59e0b' // Orange - Average
    return '#ef4444' // Red - Low
  }

  const options: Highcharts.Options = {
    ...getDarkModeChartOptions(isDarkMode),
    chart: {
      type: 'solidgauge',
      backgroundColor: 'transparent',
      height: '100%',
    },
    title: {
      text: 'Profitability',
      align: 'left',
      style: {
        fontSize: '16px',
        fontWeight: '600',
        color: isDarkMode ? '#f3f4f6' : '#111827'
      }
    },
    subtitle: {
      text: `₹${totalProfit.toLocaleString('en-IN')}`,
      align: 'left',
      style: {
        fontSize: '28px',
        fontWeight: '700',
        color: isDarkMode ? '#f3f4f6' : '#111827'
      },
      y: 40
    },
    pane: {
      center: ['50%', '75%'],
      size: '100%',
      startAngle: -90,
      endAngle: 90,
      background: [{
        backgroundColor: isDarkMode ? '#374151' : '#f3f4f6',
        innerRadius: '60%',
        outerRadius: '100%',
        shape: 'arc',
        borderWidth: 0
      }]
    },
    exporting: {
      enabled: false
    },
    tooltip: {
      enabled: false
    },
    yAxis: {  
      // @ts-ignore
      min: 0,
      max: 100,
      stops: [
        [0.15, '#ef4444'], // 0-15% Red
        [0.25, '#f59e0b'], // 15-25% Orange
        [0.40, '#3b82f6'], // 25-40% Blue
        [1, '#10b981']     // 40-100% Green
      ],
      // @ts-ignore
      lineWidth: 0,
      tickWidth: 0,
      // @ts-ignore
      minorTickInterval: undefined,
      tickAmount: 2,
      labels: {
        enabled: false
      }
    },
    plotOptions: {
      solidgauge: {
        dataLabels: {
          enabled: true,
          borderWidth: 0,
          y: -30,
          useHTML: true,
          formatter: function() {
            return `
              <div style="text-align: center;">
                <span style="font-size: 32px; font-weight: 700; color: ${getColor(this.y as number)}">
                  ${(this.y as number).toFixed(1)}%
                </span>
                <br/>
                <span style="font-size: 11px; color: #6b7280; font-weight: 500; margin-top: 4px; display: inline-block;">
                  Profit Margin
                </span>
              </div>
            `
          }
        },
        linecap: 'round',
        stickyTracking: false,
        rounded: true
      }
    },
    series: [{
      type: 'solidgauge',
      name: 'Profit Margin',
      data: [{
        y: Math.min(profitMargin, 100),
        color: getColor(profitMargin)
      }],
      innerRadius: '60%',
      radius: '100%'
    }],
    credits: {
      enabled: false
    },
    responsive: {
      rules: [{
        condition: {
          maxWidth: 500
        },
        chartOptions: {
          pane: {
            center: ['50%', '70%'],
            size: '90%'
          },
          subtitle: {
            style: {
              fontSize: '24px'
            }
          },
          plotOptions: {
            solidgauge: {
              dataLabels: {
                y: -25
              }
            }
          }
        }
      }]
    }
  }

  if (!Highcharts) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-gray-400">Loading chart...</div>
      </div>
    )
  }

  return (
    <div className="w-full h-full relative">
      <HighchartsReact highcharts={Highcharts} options={options} ref={chartRef} />
      <div className="absolute bottom-2 left-4 right-4">
        <p className={`text-xs text-center ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Total profit this period</p>
        <div className="flex items-center justify-center gap-4 mt-2">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-red-500"></div>
            <span className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>0-15%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-orange-500"></div>
            <span className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>15-25%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
            <span className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>25-40%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>40%+</span>
          </div>
        </div>
      </div>
    </div>
  )
}
