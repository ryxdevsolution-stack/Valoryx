'use client'

import { useEffect, useRef } from 'react'
import Highcharts from 'highcharts'
import HighchartsReact from 'highcharts-react-official'
import { useTheme } from '@/contexts/ThemeContext'
import { getDarkModeChartOptions } from '@/lib/highcharts-config'

interface PaymentMethodsColumnChartProps {
  data: Array<{ name: string; value: number }>
}

export default function PaymentMethodsColumnChart({ data }: PaymentMethodsColumnChartProps) {
  const chartRef = useRef<HighchartsReact.RefObject>(null)
  const { isDarkMode } = useTheme()

  useEffect(() => {
    const FLOAT = /^-?\d+\.?\d*$/

    // Animated textSetter from your code
    Highcharts.Fx.prototype.textSetter = function () {
      const chart = Highcharts.charts[this.elem.renderer.chartIndex]

      if (!chart) {
        return
      }

      let thousandsSep = chart.numberFormatter('1000.0')[1]

      if (/[0-9]/.test(thousandsSep)) {
        thousandsSep = ' '
      }

      const replaceRegEx = new RegExp(thousandsSep, 'g')

      let startValue = this.start.replace(replaceRegEx, '')
      let endValue = this.end.replace(replaceRegEx, '')
      let currentValue = this.end.replace(replaceRegEx, '')

      if ((startValue || '').match(FLOAT)) {
        const startNum = parseInt(startValue, 10)
        const endNum = parseInt(endValue, 10)

        currentValue = chart.numberFormatter(
          Math.round(startNum + (endNum - startNum) * this.pos),
          0
        )
      }

      this.elem.endText = this.end

      this.elem.attr(this.prop, currentValue, null, true)
    }

    // textGetter
    Highcharts.SVGElement.prototype.textGetter = function () {
      const ct = this.text.element.textContent || ''
      return this.endText ? this.endText : ct.substring(0, ct.length / 2)
    }

    // Wrap drawDataLabels for animation
    Highcharts.wrap(Highcharts.Series.prototype, 'drawDataLabels', function (proceed) {
      const attr = Highcharts.SVGElement.prototype.attr
      const chart = this.chart

      if (chart.sequenceTimer) {
        this.points.forEach((point: any) =>
          (point.dataLabels || []).forEach(
            (label: any) =>
              (label.attr = function (hash: any) {
                if (
                  hash &&
                  hash.text !== undefined &&
                  chart.isResizing === 0
                ) {
                  const text = hash.text

                  delete hash.text

                  return this
                    .attr(hash)
                    .animate({ text })
                }
                return attr.apply(this, arguments)
              })
          )
        )
      }

      const ret = proceed.apply(
        this,
        Array.prototype.slice.call(arguments, 1)
      )

      this.points.forEach((p: any) =>
        (p.dataLabels || []).forEach((d: any) => (d.attr = attr))
      )

      return ret
    })
  }, [])

  const options: Highcharts.Options = {
    ...getDarkModeChartOptions(isDarkMode),
    chart: {
      type: 'column',
      backgroundColor: 'transparent',
      animation: {
        duration: 500
      }
    },
    title: {
      text: 'Payment Methods',
      align: 'left',
      style: {
        color: isDarkMode ? '#f3f4f6' : undefined
      }
    },
    xAxis: {
      categories: data.map(d => d.name),
      crosshair: true,
      gridLineColor: isDarkMode ? '#374151' : undefined,
      lineColor: isDarkMode ? '#374151' : undefined,
      tickColor: isDarkMode ? '#374151' : undefined,
      labels: {
        style: {
          color: isDarkMode ? '#9ca3af' : undefined
        }
      }
    },
    yAxis: {
      min: 0,
      title: {
        text: 'Amount (₹)',
        style: {
          color: isDarkMode ? '#9ca3af' : undefined
        }
      },
      gridLineColor: isDarkMode ? '#374151' : undefined,
      lineColor: isDarkMode ? '#374151' : undefined,
      tickColor: isDarkMode ? '#374151' : undefined,
      labels: {
        style: {
          color: isDarkMode ? '#9ca3af' : undefined
        }
      }
    },
    tooltip: {
      valueSuffix: ' ₹',
      backgroundColor: isDarkMode ? '#1f2937' : undefined,
      borderColor: isDarkMode ? '#374151' : undefined,
      style: {
        color: isDarkMode ? '#f3f4f6' : undefined
      }
    },
    credits: {
      enabled: false
    },
    plotOptions: {
      column: {
        borderRadius: '25%',
        dataLabels: {
          enabled: true
        },
        animation: false,
        groupPadding: 0,
        pointPadding: 0.1,
        borderWidth: 0
      }
    },
    series: [{
      type: 'column',
      name: 'Payment Amount',
      data: data.map(d => d.value)
    }],
    responsive: {
      rules: [{
        condition: {
          maxWidth: 550
        },
        chartOptions: {
          xAxis: {
            visible: false
          },
          plotOptions: {
            series: {
              dataLabels: [{
                enabled: true,
                y: 8
              }, {
                enabled: true,
                format: '{point.name}',
                y: -8,
                style: {
                  fontWeight: 'normal',
                  opacity: 0.7
                }
              }]
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
