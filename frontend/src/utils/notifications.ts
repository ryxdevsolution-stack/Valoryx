/**
 * System notification utility for showing native OS notifications
 */

export interface NotificationOptions {
  title: string
  body: string
  icon?: string
  requireInteraction?: boolean
  tag?: string
}

export class SystemNotification {
  /**
   * Request permission to show notifications
   */
  static async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.log('This browser does not support desktop notifications')
      return false
    }

    if (Notification.permission === 'granted') {
      return true
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission()
      return permission === 'granted'
    }

    return false
  }

  /**
   * Show a system notification
   */
  static async show(options: NotificationOptions): Promise<void> {
    const hasPermission = await this.requestPermission()

    if (!hasPermission) {
      // Fallback to console warning if notifications are not available
      console.warn(`[Notification] ${options.title}: ${options.body}`)
      return
    }

    const notification = new Notification(options.title, {
      body: options.body,
      icon: options.icon || '/favicon.ico',
      requireInteraction: options.requireInteraction || false,
      tag: options.tag,
    })

    // Auto close after 5 seconds if not requiring interaction
    if (!options.requireInteraction) {
      setTimeout(() => notification.close(), 5000)
    }
  }

  /**
   * Show stock warning notifications
   */
  static async showStockWarnings(warnings: string[]): Promise<void> {
    if (!warnings || warnings.length === 0) return

    // Request permission first
    await this.requestPermission()

    // Show notification for stock warnings
    const title = warnings.length === 1
      ? '⚠️ Stock Warning'
      : `⚠️ ${warnings.length} Stock Warnings`

    const body = warnings.join('\n')

    await this.show({
      title,
      body,
      requireInteraction: true, // Keep visible until user dismisses
      tag: 'stock-warning', // Prevents duplicate notifications
    })
  }

  /**
   * Show success notification
   */
  static async showSuccess(message: string): Promise<void> {
    await this.show({
      title: '✅ Success',
      body: message,
      tag: 'success',
    })
  }

  /**
   * Show error notification
   */
  static async showError(message: string): Promise<void> {
    await this.show({
      title: '❌ Error',
      body: message,
      requireInteraction: true,
      tag: 'error',
    })
  }
}