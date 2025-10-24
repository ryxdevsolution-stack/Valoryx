'use client'

import { useEffect, useRef } from 'react'
import Highcharts from 'highcharts'
import HighchartsReact from 'highcharts-react-official'
import { useTheme } from '@/contexts/ThemeContext'
import { getDarkModeChartOptions } from '@/lib/highcharts-config'

interface RevenueAreaChartProps {
  data: Array<{ date: string; revenue: number; bills: number }>
}

export default function RevenueAreaChart({ data }: RevenueAreaChartProps) {
  const { isDarkMode } = useTheme()
  const chartRef = useRef<HighchartsReact.RefObject>(null)

  useEffect(() => {
    // Axis animation
    Highcharts.addEvent(Highcharts.Axis, 'afterRender', function () {
      const axis = this
      const chart = axis.chart
      const animation = Highcharts.animObject(chart.renderer.globalAnimation)

      if (axis.axisGroup) {
        axis.axisGroup
          .attr({
            opacity: 0,
            rotation: -3,
            scaleY: 0.9
          })
          .animate({
            opacity: 1,
            rotation: 0,
            scaleY: 1
          }, animation)
      }

      if (axis.horiz && axis.labelGroup) {
        axis.labelGroup
          .attr({
            opacity: 0,
            rotation: 3,
            scaleY: 0.5
          })
          .animate({
            opacity: 1,
            rotation: 0,
            scaleY: 1
          }, animation)
      } else if (axis.labelGroup) {
        axis.labelGroup
          .attr({
            opacity: 0,
            rotation: 3,
            scaleX: -0.5
          })
          .animate({
            opacity: 1,
            rotation: 0,
            scaleX: 1
          }, animation)
      }
    })
  }, [])

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const options: Highcharts.Options = {
    ...getDarkModeChartOptions(isDarkMode),
    chart: {
      type: 'area',
      backgroundColor: 'transparent',
      animation: {
        duration: 1000
      },
      height: 300
    },
    title: {
      text: 'Revenue Trend',
      align: 'left',
      style: {
        fontSize: '16px',
        fontWeight: '600',
        color: isDarkMode ? '#f3f4f6' : '#1f2937'
      }
    },
    subtitle: {
      text: `Total: ₹${data.reduce((sum, d) => sum + d.revenue, 0).toLocaleString('en-IN')}`,
      align: 'left',
      style: {
        fontSize: '12px',
        color: isDarkMode ? '#9ca3af' : '#666'
      }
    },
    xAxis: {
      categories: data.map(d => formatDate(d.date)),
      lineWidth: 1,
      lineColor: isDarkMode ? '#374151' : '#e5e7eb',
      labels: {
        style: {
          fontSize: '11px',
          color: isDarkMode ? '#9ca3af' : '#4b5563'
        }
      }
    },
    yAxis: {
      title: {
        text: 'Revenue (₹)',
        style: {
          fontSize: '12px',
          color: isDarkMode ? '#9ca3af' : '#4b5563'
        }
      },
      gridLineColor: isDarkMode ? '#374151' : '#f3f4f6',
      labels: {
        formatter: function() {
          return '₹' + (this.value as number).toLocaleString('en-IN')
        },
        style: {
          fontSize: '11px',
          color: isDarkMode ? '#9ca3af' : '#4b5563'
        }
      }
    },
    credits: {
      enabled: false
    },
    legend: {
      enabled: false
    },
    tooltip: {
      shared: true,
      backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
      borderColor: isDarkMode ? '#374151' : '#e5e7eb',
      borderRadius: 8,
      shadow: true,
      useHTML: true,
      style: {
        color: isDarkMode ? '#f3f4f6' : '#1f2937'
      },
      formatter: function() {
        const point = this.points?.[0]
        const dataIndex = point?.point.index
        const bills = data[dataIndex as number]?.bills || 0
        return `
          <div style="padding: 8px;">
            <strong style="font-size: 13px; color: ${isDarkMode ? '#f3f4f6' : '#1f2937'};">${this.x}</strong><br/>
            <span style="color: #3b82f6; font-size: 12px;">●</span> Revenue: <strong style="color: ${isDarkMode ? '#f3f4f6' : '#1f2937'};">₹${(this.y as number).toLocaleString('en-IN')}</strong><br/>
            <span style="font-size: 11px; color: ${isDarkMode ? '#9ca3af' : '#666'};">Bills: ${bills}</span>
          </div>
        `
      }
    },
    plotOptions: {
      area: {
        animation: {
          duration: 1000
        },
        fillColor: {
          linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
          stops: [
            [0, 'rgba(59, 130, 246, 0.3)'],
            [1, 'rgba(59, 130, 246, 0.05)']
          ]
        },
        marker: {
          enabled: true,
          radius: 4,
          fillColor: '#3b82f6',
          lineWidth: 2,
          lineColor: '#ffffff',
          states: {
            hover: {
              radius: 6
            }
          }
        },
        lineWidth: 3,
        lineColor: '#3b82f6',
        states: {
          hover: {
            lineWidth: 3
          }
        }
      }
    },
    series: [{
      type: 'area',
      name: 'Revenue',
      data: data.map(d => d.revenue)
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
          yAxis: {
            labels: {
              formatter: function() {
                return '₹' + ((this.value as number) / 1000).toFixed(0) + 'k'
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
