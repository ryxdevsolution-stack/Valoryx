import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PermissionHelpTooltip } from '@/components/admin/PermissionHelpTooltip'

describe('PermissionHelpTooltip', () => {
  it('renders nothing for an unknown permission_name', () => {
    const { container } = render(<PermissionHelpTooltip permissionName="bogus_perm_xyz" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the (i) trigger for a known permission', () => {
    render(<PermissionHelpTooltip permissionName="apply_discount" />)
    const trigger = screen.getByRole('button', { name: /more info about apply_discount/i })
    expect(trigger).toBeInTheDocument()
  })

  it('opens the tooltip card on trigger click and shows icon + name + example', () => {
    render(<PermissionHelpTooltip permissionName="apply_discount" />)
    const trigger = screen.getByRole('button', { name: /more info about apply_discount/i })
    fireEvent.click(trigger)

    const card = screen.getByRole('tooltip')
    expect(card).toHaveTextContent('🏷️')
    expect(card).toHaveTextContent('apply_discount')
    expect(card).toHaveTextContent(/cashier reduces the bill total by 10%/i)
  })

  it('closes the tooltip when Escape is pressed', () => {
    render(<PermissionHelpTooltip permissionName="apply_discount" />)
    fireEvent.click(screen.getByRole('button', { name: /more info about apply_discount/i }))
    expect(screen.getByRole('tooltip')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('closes the tooltip when clicking outside', () => {
    render(
      <div>
        <PermissionHelpTooltip permissionName="apply_discount" />
        <span data-testid="outside">click me</span>
      </div>
    )
    fireEvent.click(screen.getByRole('button', { name: /more info about apply_discount/i }))
    expect(screen.getByRole('tooltip')).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('toggles open/closed on repeated clicks', () => {
    render(<PermissionHelpTooltip permissionName="apply_discount" />)
    const trigger = screen.getByRole('button', { name: /more info about apply_discount/i })

    fireEvent.click(trigger)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    fireEvent.click(trigger)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})
