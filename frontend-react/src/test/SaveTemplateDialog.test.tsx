import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from './mocks/server'
import { SaveTemplateDialog } from '@/components/admin/SaveTemplateDialog'

describe('SaveTemplateDialog (create mode)', () => {
  it('renders the dialog with empty fields by default', () => {
    render(
      <SaveTemplateDialog
        open
        mode="create"
        currentPermissions={['gst_billing', 'apply_discount']}
        onSaved={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByLabelText(/template name/i)).toHaveValue('')
    expect(screen.getByLabelText(/description/i)).toHaveValue('')
    // The permission count is shown as a readonly caption.
    expect(screen.getByText(/2 permissions/i)).toBeInTheDocument()
  })

  it('blocks submit when name is too short', async () => {
    render(
      <SaveTemplateDialog
        open mode="create"
        currentPermissions={['gst_billing']}
        onSaved={vi.fn()} onClose={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText(/template name/i), { target: { value: 'AB' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(await screen.findByText(/3-40 characters/i)).toBeInTheDocument()
  })

  it('submits POST and calls onSaved on success', async () => {
    server.use(
      http.post('*/api/admin/permission-templates/custom', () =>
        HttpResponse.json({ template: { template_id: 't1', name: 'My Cashier', permissions: ['gst_billing'], is_custom: true } }, { status: 201 }),
      ),
    )
    const onSaved = vi.fn()
    const onClose = vi.fn()
    render(
      <SaveTemplateDialog
        open mode="create"
        currentPermissions={['gst_billing']}
        onSaved={onSaved} onClose={onClose}
      />,
    )
    fireEvent.change(screen.getByLabelText(/template name/i), { target: { value: 'My Cashier' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ template_id: 't1' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows server validation error inline next to the offending field', async () => {
    server.use(
      http.post('*/api/admin/permission-templates/custom', () =>
        HttpResponse.json({ error: 'Validation failed', field: 'name', message: 'A template with this name already exists' }, { status: 400 }),
      ),
    )
    render(
      <SaveTemplateDialog
        open mode="create"
        currentPermissions={['gst_billing']}
        onSaved={vi.fn()} onClose={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText(/template name/i), { target: { value: 'Cashier+' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(await screen.findByText(/already exists/i)).toBeInTheDocument()
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(
      <SaveTemplateDialog
        open mode="create"
        currentPermissions={['gst_billing']}
        onSaved={vi.fn()} onClose={onClose}
      />,
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})

describe('SaveTemplateDialog (edit mode)', () => {
  it('pre-fills name and description from initialValues', () => {
    render(
      <SaveTemplateDialog
        open mode="edit"
        initialValues={{ template_id: 't1', name: 'Existing', description: 'desc here' }}
        currentPermissions={['gst_billing']}
        onSaved={vi.fn()} onClose={vi.fn()}
      />,
    )
    expect(screen.getByLabelText(/template name/i)).toHaveValue('Existing')
    expect(screen.getByLabelText(/description/i)).toHaveValue('desc here')
  })

  it('submits PUT to the right URL', async () => {
    let receivedUrl = ''
    server.use(
      http.put('*/api/admin/permission-templates/custom/:id', ({ request, params }) => {
        receivedUrl = request.url
        return HttpResponse.json({ template: { template_id: params.id as string, name: 'Edited', permissions: ['gst_billing'], is_custom: true } })
      }),
    )
    const onSaved = vi.fn()
    render(
      <SaveTemplateDialog
        open mode="edit"
        initialValues={{ template_id: 'edit-id', name: 'Existing' }}
        currentPermissions={['gst_billing']}
        onSaved={onSaved} onClose={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText(/template name/i), { target: { value: 'Edited' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(receivedUrl).toContain('/permission-templates/custom/edit-id')
  })
})
