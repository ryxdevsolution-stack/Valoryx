import {
  CreditCard,
  Crown,
  Loader2,
  XCircle,
  RefreshCw,
  ArrowRightLeft,
  ExternalLink,
} from 'lucide-react'

interface Transaction {
  transaction_id: string
  plan_id: string
  razorpay_order_id: string
  razorpay_payment_id: string
  amount: number
  currency: string
  billing_cycle: string
  status: string
  notes: string | null
  created_at: string | null
  paid_at: string | null
}

interface SubscriptionTabProps {
  client: any
  transactions: Transaction[]
  loadingPayments: boolean
  showCancelConfirm: boolean
  setShowCancelConfirm: (v: boolean) => void
  cancelReason: string
  setCancelReason: (v: string) => void
  cancelReasonOther: string
  setCancelReasonOther: (v: string) => void
  cancelling: boolean
  handleCancelSubscription: () => void
  formatPrice: (paise: number) => string
  formatDate: (d: string | null) => string
  getUpgradeUrl: () => string
}

export default function SubscriptionTab({
  client,
  transactions,
  loadingPayments,
  showCancelConfirm,
  setShowCancelConfirm,
  cancelReason,
  setCancelReason,
  cancelReasonOther,
  setCancelReasonOther,
  cancelling,
  handleCancelSubscription,
  formatPrice,
  formatDate,
  getUpgradeUrl,
}: SubscriptionTabProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
        <CreditCard className="w-5 h-5" /> Subscription & Payments
      </h3>

      {/* Current Plan Status */}
      <div className="flex items-center gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50 mb-4">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
          client?.subscription_status === 'active'
            ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400'
            : client?.subscription_status === 'trial'
            ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400'
            : client?.subscription_status === 'cancelled'
            ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400'
            : 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
        }`}>
          <Crown className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            {client?.subscription_status === 'active' ? 'Active Subscription' :
             client?.subscription_status === 'trial' ? 'Free Trial' :
             client?.subscription_status === 'cancelled' ? 'Cancelled' :
             'Expired'}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {client?.subscription_status === 'active' ? 'Your subscription is active' :
             client?.subscription_status === 'trial'
               ? `${client.trial_days_remaining ?? 0} days remaining`
               : client?.subscription_status === 'cancelled'
               ? `Cancelled — access until ${client.subscription_end_date ? formatDate(client.subscription_end_date) : 'end of period'}`
               : 'Please upgrade to continue'}
          </p>
        </div>
      </div>

      {/* Subscription Action Buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        {client?.subscription_status === 'active' && (
          <>
            <a
              href={getUpgradeUrl()}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" /> Switch Plan
            </a>
            <button
              onClick={() => setShowCancelConfirm(true)}
              className="flex items-center gap-1.5 px-4 py-2 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-medium rounded-lg transition-colors"
            >
              <XCircle className="w-3.5 h-3.5" /> Cancel Subscription
            </button>
          </>
        )}
        {(client?.subscription_status === 'cancelled' || client?.subscription_status === 'expired') && (
          <a
            href={getUpgradeUrl()}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Reactivate Plan
          </a>
        )}
        {client?.subscription_status === 'trial' && (
          <a
            href={getUpgradeUrl()}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Upgrade <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {/* Cancel Confirmation Dialog */}
      {showCancelConfirm && (
        <div className="p-4 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 mb-4">
          <p className="text-sm font-semibold text-red-700 dark:text-red-400 mb-2">Cancel Subscription?</p>
          <p className="text-xs text-red-600 dark:text-red-300 mb-3">
            You will lose access to premium features after your current billing period ends. You can reactivate anytime.
          </p>
          <div className="mb-3">
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">Why are you cancelling?</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {['Too expensive', 'Not using it enough', 'Missing features', 'Switching to another product', 'Other'].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setCancelReason(r)}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                    cancelReason === r
                      ? 'bg-red-600 text-white border-red-600'
                      : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            {cancelReason === 'Other' && (
              <input
                type="text"
                value={cancelReasonOther}
                onChange={(e) => setCancelReasonOther(e.target.value)}
                placeholder="Please tell us why..."
                className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setShowCancelConfirm(false); setCancelReason(''); setCancelReasonOther('') }}
              className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Keep Subscription
            </button>
            <button
              type="button"
              onClick={handleCancelSubscription}
              disabled={cancelling || !cancelReason || (cancelReason === 'Other' && !cancelReasonOther.trim())}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {cancelling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
              Yes, Cancel
            </button>
          </div>
        </div>
      )}

      {/* Payment History */}
      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Payment History</h4>
      {loadingPayments ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : transactions.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No payments yet</p>
      ) : (
        <div className="space-y-2">
          {transactions.map((txn) => (
            <div key={txn.transaction_id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                txn.status === 'paid' ? 'bg-emerald-500' :
                txn.status === 'failed' ? 'bg-red-500' :
                txn.status === 'refunded' ? 'bg-amber-500' :
                'bg-gray-400'
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {formatPrice(txn.amount)}
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-2 capitalize">{txn.billing_cycle}</span>
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {txn.paid_at ? formatDate(txn.paid_at) : formatDate(txn.created_at)}
                  {txn.razorpay_payment_id && (
                    <span className="ml-2 text-gray-400">#{txn.razorpay_payment_id.slice(-8)}</span>
                  )}
                </p>
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                txn.status === 'paid' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                txn.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                txn.status === 'refunded' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
              }`}>
                {txn.status === 'paid' ? 'Successful' : txn.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
