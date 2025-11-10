'use client'

import { useState, useCallback } from 'react'
import Notification, { NotificationType } from '@/components/Notification'

interface NotificationData {
  id: string
  type: NotificationType
  title: string
  message: string
}

export function useNotification() {
  const [notifications, setNotifications] = useState<NotificationData[]>([])

  const show = useCallback((type: NotificationType, title: string, message: string) => {
    const id = Math.random().toString(36).substring(7)
    setNotifications(prev => [...prev, { id, type, title, message }])
  }, [])

  const showSuccess = useCallback((title: string, message: string) => {
    show('success', title, message)
  }, [show])

  const showError = useCallback((title: string, message: string) => {
    show('error', title, message)
  }, [show])

  const showWarning = useCallback((title: string, message: string) => {
    show('warning', title, message)
  }, [show])

  const showInfo = useCallback((title: string, message: string) => {
    show('info', title, message)
  }, [show])

  const remove = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }, [])

  const NotificationContainer = useCallback(() => (
    <>
      {notifications.map((notification, index) => (
        <div
          key={notification.id}
          style={{
            position: 'fixed',
            top: `${1 + index * 6}rem`,
            right: '1rem',
            zIndex: 9999
          }}
        >
          <Notification
            type={notification.type}
            title={notification.title}
            message={notification.message}
            onClose={() => remove(notification.id)}
          />
        </div>
      ))}
    </>
  ), [notifications, remove])

  return {
    showSuccess,
    showError,
    showWarning,
    showInfo,
    NotificationContainer
  }
}
