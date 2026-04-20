import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:3002'
const EMAIL = 'admin@ryx.com'
const PASSWORD = 'admin123'

test.describe('Salary & Attendance – full flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.waitForSelector('input[type="email"]')
    await page.fill('input[type="email"]', EMAIL)
    await page.fill('input[type="password"]', PASSWORD)
    await page.click('button[type="submit"]')
    // Wait for navigation away from login page
    await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 15000 })
  })

  test('A → navigate to salary page', async ({ page }) => {
    await page.goto(`${BASE}/salary`)
    await expect(page.getByText('Salary & Attendance')).toBeVisible()
    await expect(page.getByText('Employees')).toBeVisible()
  })

  test('B → employee list loads', async ({ page }) => {
    await page.goto(`${BASE}/salary`)
    // Employee panel renders
    await expect(page.locator('text=+ Add')).toBeVisible()
  })

  test('C → add new test employee', async ({ page }) => {
    await page.goto(`${BASE}/salary`)
    await page.click('text=+ Add')
    await page.fill('input[placeholder="Full name"]', 'PlaywrightEmp')
    await page.fill('input[placeholder="Phone (optional)"]', '9999999999')
    // Select daily pay type
    await page.locator('select, [role="combobox"]').first().selectOption('daily')
    await page.fill('input[placeholder="0.00"]', '500')
    await page.click('button:has-text("Add Employee")')
    await expect(page.getByText('PlaywrightEmp')).toBeVisible({ timeout: 5000 })
  })

  test('D → select employee and check attendance panel', async ({ page }) => {
    await page.goto(`${BASE}/salary`)
    // Click first employee
    await page.locator('[data-testid="employee-card"], .cursor-pointer').first().click()
    await expect(page.getByText('Attendance')).toBeVisible()
    await expect(page.getByText('Salary Cycles')).toBeVisible()
  })

  test('E → check in employee', async ({ page }) => {
    await page.goto(`${BASE}/salary`)
    await page.locator('.cursor-pointer').first().click()
    // Should show Check In button (not clocked in)
    const checkInBtn = page.locator('button:has-text("Check In")')
    if (await checkInBtn.isVisible()) {
      await checkInBtn.click()
      await expect(page.locator('input[type="datetime-local"]')).toBeVisible()
      await page.click('button:has-text("Check In"), button:has-text("Save")')
      // After check-in, should show Clocked In badge
      await expect(page.locator('text=Clocked In')).toBeVisible({ timeout: 5000 })
    }
  })

  test('F → check out employee', async ({ page }) => {
    await page.goto(`${BASE}/salary`)
    await page.locator('.cursor-pointer').first().click()
    const checkOutBtn = page.locator('button:has-text("Check Out")')
    if (await checkOutBtn.isVisible()) {
      await checkOutBtn.click()
      // Badge should disappear
      await expect(page.locator('text=Clocked In')).not.toBeVisible({ timeout: 5000 })
    }
  })

  test('G → create salary cycle', async ({ page }) => {
    await page.goto(`${BASE}/salary`)
    await page.locator('.cursor-pointer').first().click()
    await page.click('button:has-text("+ New Cycle")')
    await expect(page.locator('text=New Salary Cycle')).toBeVisible()
    await page.click('button:has-text("Create Cycle")')
    // Cycle should appear
    await expect(page.locator('text=open').or(page.locator('text=Open'))).toBeVisible({ timeout: 5000 })
  })
})
