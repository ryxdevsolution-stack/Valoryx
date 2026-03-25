import { http, HttpResponse } from 'msw'

const BASE = 'http://localhost:5017/api'

export const handlers = [
  http.post(`${BASE}/auth/login`, () =>
    HttpResponse.json({
      token: 'mock-jwt-token',
      user: {
        user_id: 'u1',
        email: 'owner@example.com',
        role: 'manager',
        permissions: ['gst_billing', 'non_gst_billing', 'stock_entry'],
        is_super_admin: false,
        full_name: 'Test User',
      },
      client_id: 'c1',
      client_name: 'Test Restaurant',
    })
  ),

  http.get(`${BASE}/stock`, () =>
    HttpResponse.json([
      {
        product_id: 'p1',
        product_name: 'Widget',
        rate: 100,
        quantity: 50,
        item_code: 'W1',
        barcode: '123456',
        gst_percentage: 18,
        hsn_code: '1234',
        unit: 'pcs',
        available_quantity: 50,
      },
    ])
  ),

  http.post(`${BASE}/billing/gst`, () =>
    HttpResponse.json({ success: true, bill_id: 'b1', bill_number: 1 })
  ),

  http.post(`${BASE}/billing/non-gst`, () =>
    HttpResponse.json({ success: true, bill_id: 'b2', bill_number: 2 })
  ),

  http.get(`${BASE}/billing/list`, () =>
    HttpResponse.json({ bills: [], total: 0 })
  ),

  http.get(`${BASE}/billing/next-number`, () =>
    HttpResponse.json({ next_bill_number: 42 })
  ),

  http.get(`${BASE}/customer/search`, () =>
    HttpResponse.json([])
  ),

  http.get(`${BASE}/profile`, () =>
    HttpResponse.json({
      user_id: 'u1',
      email: 'owner@example.com',
      role: 'manager',
      permissions: ['gst_billing', 'non_gst_billing', 'stock_entry'],
      is_super_admin: false,
      full_name: 'Test User',
    })
  ),

  http.get(`${BASE}/clients/:clientId`, () =>
    HttpResponse.json({
      client: {
        client_id: 'c1',
        client_name: 'Test Restaurant',
        subscription_status: 'active',
        plan_id: 'pro',
      },
    })
  ),

]
