import api from '@/lib/api'

export interface WebhookEndpoint {
  endpoint_id: string
  client_id: string
  url: string
  description: string | null
  events: string
  is_active: boolean
  created_at: string | null
  secret?: string // only present immediately after creation
}

export interface WebhookDelivery {
  delivery_id: string
  endpoint_id: string
  event_type: string
  attempt: number
  status: 'pending' | 'success' | 'failed' | 'retrying'
  response_status: number | null
  error: string | null
  created_at: string | null
  delivered_at: string | null
}

export interface CreateEndpointPayload {
  url: string
  events?: string
  description?: string
}

export const webhookService = {
  list: () =>
    api.get<{ success: boolean; endpoints: WebhookEndpoint[] }>('/webhooks')
      .then((r) => r.data.endpoints),

  create: (payload: CreateEndpointPayload) =>
    api.post<{ success: boolean; endpoint: WebhookEndpoint }>('/webhooks', payload)
      .then((r) => r.data.endpoint),

  update: (endpointId: string, payload: Partial<CreateEndpointPayload & { is_active: boolean }>) =>
    api.patch<{ success: boolean; endpoint: WebhookEndpoint }>(`/webhooks/${endpointId}`, payload)
      .then((r) => r.data.endpoint),

  remove: (endpointId: string) =>
    api.delete(`/webhooks/${endpointId}`),

  deliveries: (endpointId: string, page = 1) =>
    api.get<{ success: boolean; deliveries: WebhookDelivery[]; total: number; page: number }>(
      `/webhooks/${endpointId}/deliveries?page=${page}`
    ).then((r) => r.data),

  test: (endpointId: string) =>
    api.post(`/webhooks/${endpointId}/test`),
}
