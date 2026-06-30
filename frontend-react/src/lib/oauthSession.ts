/**
 * Maps an OAuth-shaped login response ({ token, user, client }) into the
 * ClientContext userData / clientData shapes.
 *
 * Shared by the web Google callback (OAuthCallback.tsx) and the Electron
 * desktop-login handoff (Login.tsx) so the field mapping lives in exactly one
 * place. Regular password login uses a different (flat) response shape and does
 * not go through this.
 */
export function mapOAuthLoginResponse(data: any) {
  const user = data.user
  const client = data.client

  const userData = {
    user_id: user.user_id,
    email: user.email,
    full_name: user.full_name || user.email.split('@')[0],
    phone: user.phone || '',
    department: user.department || '',
    role: user.role,
    is_super_admin: user.is_super_admin || false,
    permissions: user.permissions || [],
    totp_enabled: user.totp_enabled ?? false,
    must_change_password: user.must_change_password ?? false,
    avatar_url: user.avatar_url || null,
  }

  const clientData = {
    client_id: client.client_id,
    client_name: client.client_name,
    logo_url: client.logo_url || null,
    address: client.address || '',
    phone: client.phone || '',
    email: client.email || '',
    gstin: client.gstin || '',
    subscription_status: client.subscription_status,
    trial_end_date: client.trial_end_date || null,
    trial_days_remaining: client.trial_days_remaining || null,
    subscription_end_date: client.subscription_end_date || null,
    country: client.country,
    currency_code: client.currency_code,
    currency_symbol: client.currency_symbol,
    locale: client.locale,
    tax_config: client.tax_config,
    setup_completed: client.setup_completed,
  }

  return { token: data.token as string, user, client, userData, clientData }
}
