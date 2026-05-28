import api from '@/lib/api'

export type CustomTemplateInput = {
  name: string
  description?: string
  permissions: string[]
}

export type PermissionTemplate = {
  name: string
  description: string
  business_type: string
  permissions: string[]
  is_custom: boolean
  // Custom-template-only fields:
  template_id?: string
  created_by?: string
  created_by_email?: string | null
  created_at?: string
  updated_at?: string
}

export type TemplatesResponse = {
  templates: Record<string, PermissionTemplate>
}

export type SingleTemplateResponse = {
  template: PermissionTemplate
}

export const permissionTemplateService = {
  /**
   * List all permission templates (built-in + active custom), merged into a
   * single dict keyed by template key (built-ins) or template_id (custom).
   */
  list(): Promise<TemplatesResponse> {
    return api.get<TemplatesResponse>('/admin/permission-templates').then(r => r.data)
  },

  create(input: CustomTemplateInput): Promise<SingleTemplateResponse> {
    return api.post<SingleTemplateResponse>(
      '/admin/permission-templates/custom',
      input,
    ).then(r => r.data)
  },

  update(template_id: string, input: CustomTemplateInput): Promise<SingleTemplateResponse> {
    return api.put<SingleTemplateResponse>(
      `/admin/permission-templates/custom/${template_id}`,
      input,
    ).then(r => r.data)
  },

  delete(template_id: string): Promise<void> {
    return api.delete(`/admin/permission-templates/custom/${template_id}`).then(() => undefined)
  },
}
