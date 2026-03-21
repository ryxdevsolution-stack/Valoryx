import { useEffect, useRef } from 'react'
import { Users, CreditCard, User, MonitorSmartphone, ShieldCheck, Webhook } from 'lucide-react'

export type ProfileTab = 'account' | 'team' | 'subscription' | 'sessions' | 'two-factor' | 'webhooks'

interface ProfileTabsProps {
  activeTab: ProfileTab
  onTabChange: (tab: ProfileTab) => void
  showTeamTab: boolean
  showSubscriptionTab: boolean
  showWebhooksTab?: boolean
  showTwoFactorTab?: boolean
}

const TABS: { id: ProfileTab; label: string; icon: typeof User }[] = [
  { id: 'account', label: 'Account', icon: User },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'subscription', label: 'Subscription', icon: CreditCard },
  { id: 'sessions', label: 'Sessions', icon: MonitorSmartphone },
  { id: 'two-factor', label: '2FA', icon: ShieldCheck },
  { id: 'webhooks', label: 'Webhooks', icon: Webhook },
]

export default function ProfileTabs({ activeTab, onTabChange, showTeamTab, showSubscriptionTab, showWebhooksTab, showTwoFactorTab }: ProfileTabsProps) {
  const visibleTabs = TABS.filter(tab => {
    if (tab.id === 'team') return showTeamTab
    if (tab.id === 'subscription') return showSubscriptionTab
    if (tab.id === 'webhooks') return showWebhooksTab ?? false
    if (tab.id === 'two-factor') return showTwoFactorTab ?? true
    return true
  })

  const activeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [activeTab])

  return (
    <div role="tablist" className="flex gap-1 px-4 pb-2 flex-shrink-0 overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
      {visibleTabs.map(tab => {
        const Icon = tab.icon
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            ref={tab.id === activeTab ? activeRef : undefined}
            role="tab"
            type="button"
            aria-selected={isActive}
            aria-controls={`panel-${tab.id}`}
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap flex-shrink-0 ${
              isActive
                ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
