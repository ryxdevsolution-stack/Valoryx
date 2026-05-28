import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from './mocks/server'
import { permissionTemplateService } from '@/services/permissionTemplateService'

describe('permissionTemplateService', () => {
  it('list() GETs /admin/permission-templates and returns templates dict', async () => {
    const fake = {
      templates: {
        dress_shop: { name: 'Dress Shop', is_custom: false, permissions: ['x'] },
        'uuid-1':   { name: 'Custom', is_custom: true,  template_id: 'uuid-1', permissions: ['y'] },
      },
    }
    server.use(
      http.get('*/api/admin/permission-templates', () => HttpResponse.json(fake)),
    )

    const result = await permissionTemplateService.list()
    expect(result.templates.dress_shop.name).toBe('Dress Shop')
    expect(result.templates['uuid-1'].is_custom).toBe(true)
  })

  it('create() POSTs the input and returns the created template', async () => {
    let receivedBody: any = null
    server.use(
      http.post('*/api/admin/permission-templates/custom', async ({ request }) => {
        receivedBody = await request.json()
        return HttpResponse.json({
          template: {
            template_id: 'new-uuid',
            name: receivedBody.name,
            is_custom: true,
            permissions: receivedBody.permissions,
          },
        }, { status: 201 })
      }),
    )

    const out = await permissionTemplateService.create({
      name: 'New', description: 'd', permissions: ['gst_billing'],
    })
    expect(receivedBody).toEqual({ name: 'New', description: 'd', permissions: ['gst_billing'] })
    expect(out.template.template_id).toBe('new-uuid')
  })

  it('update() PUTs to the right URL with the input', async () => {
    let receivedBody: any = null
    server.use(
      http.put('*/api/admin/permission-templates/custom/abc-123', async ({ request }) => {
        receivedBody = await request.json()
        return HttpResponse.json({
          template: { template_id: 'abc-123', name: receivedBody.name, is_custom: true, permissions: [] },
        })
      }),
    )

    await permissionTemplateService.update('abc-123', { name: 'Updated', permissions: ['x'] })
    expect(receivedBody.name).toBe('Updated')
  })

  it('delete() DELETEs to the right URL and resolves to void', async () => {
    server.use(
      http.delete('*/api/admin/permission-templates/custom/del-id', () =>
        new HttpResponse(null, { status: 204 }),
      ),
    )

    await expect(permissionTemplateService.delete('del-id')).resolves.toBeUndefined()
  })

  it('create() rejects on non-2xx with the error body accessible', async () => {
    server.use(
      http.post('*/api/admin/permission-templates/custom', () =>
        HttpResponse.json({ error: 'Validation failed', field: 'name', message: 'Too short' }, { status: 400 }),
      ),
    )

    try {
      await permissionTemplateService.create({ name: 'X', permissions: ['gst_billing'] })
      throw new Error('should have thrown')
    } catch (err: any) {
      expect(err.response?.status).toBe(400)
      expect(err.response?.data?.field).toBe('name')
    }
  })
})
