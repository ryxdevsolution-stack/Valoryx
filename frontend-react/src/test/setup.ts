import '@testing-library/jest-dom'
import axios from 'axios'
import { server } from './mocks/server'
import { beforeAll, afterEach, afterAll } from 'vitest'

// Force axios to use Node.js http adapter so MSW's setupServer can intercept.
// In jsdom, axios defaults to the XHR adapter — MSW node server doesn't catch that.
axios.defaults.adapter = 'http'

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))

afterEach(() => {
  server.resetHandlers()
  localStorage.clear()
})

afterAll(() => server.close())
