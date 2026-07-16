import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import LegalLayout, { Section, List } from '@/components/landing/LegalLayout'

/** Monospace code block for request/response examples. */
function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-ink/10 bg-ink px-4 py-3 text-xs leading-relaxed text-white">
      <code>{children}</code>
    </pre>
  )
}

/** Compact endpoint row for the reference table. */
function Endpoint({
  method,
  path,
  scope,
  description,
}: {
  method: string
  path: string
  scope: string
  description: string
}) {
  const methodColor: Record<string, string> = {
    GET: 'bg-blue-100 text-blue-700',
    POST: 'bg-emerald-100 text-emerald-700',
    PUT: 'bg-amber-100 text-amber-700',
    DELETE: 'bg-red-100 text-red-700',
  }
  return (
    <div className="flex flex-col gap-1 border-b border-ink/8 py-3 last:border-0 sm:flex-row sm:items-center sm:gap-3">
      <span className={`inline-flex w-fit shrink-0 items-center rounded-md px-2 py-0.5 text-[11px] font-bold ${methodColor[method]}`}>
        {method}
      </span>
      <code className="shrink-0 font-mono text-xs text-ink">{path}</code>
      <span className="text-xs text-ink-faint">{description}</span>
      <span className="ml-auto inline-flex w-fit shrink-0 items-center rounded-full bg-ink/5 px-2 py-0.5 text-[10px] font-semibold text-ink-soft">
        {scope}
      </span>
    </div>
  )
}

/**
 * Public documentation for the Ryx External API — third-party devs/partners
 * land here from the landing page before registering for access. Mirrors
 * the actual surface in backend/routes/external.py.
 */
export default function DeveloperDocs() {
  return (
    <LegalLayout title="Ryx External API" lastUpdated="July 16, 2026">
      <div className="rounded-2xl border border-ink/10 bg-canvas p-6 sm:p-8">
        <p className="font-body text-sm leading-relaxed text-ink-soft">
          Provision Valoryx clients and manage their stock programmatically — for partners
          and developers who onboard shops on our behalf, or sync inventory from an
          external system.
        </p>
        <Link
          to="/developers/register"
          className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-ink px-6 py-3 font-body text-sm font-semibold text-white shadow-pill transition-all hover:scale-[1.03] hover:bg-[#3a4666]"
        >
          Get API Access
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <Section heading="1. How access works">
        <List
          items={[
            <>
              <strong>Register</strong> — submit your name, email, and (optional) company at{' '}
              <Link to="/developers/register" className="text-accent-blue hover:underline">
                /developers/register
              </Link>
              . No key is issued yet.
            </>,
            <>
              <strong>Approval</strong> — a Valoryx admin reviews and approves your account. This
              is a manual step, usually same-day.
            </>,
            <>
              <strong>Dev key emailed</strong> — once approved, you receive a <em>dev-level</em>{' '}
              key by email. It is shown/emailed exactly once — it cannot be retrieved again, only
              regenerated (which invalidates the old one).
            </>,
            <>
              <strong>Create clients</strong> — use your dev key to provision client shops. Each
              client you create gets its own <em>client-level</em> stock key in the response.
            </>,
          ]}
        />
      </Section>

      <Section heading="2. Authentication">
        <p>
          Every request (except registration) needs an <code className="rounded bg-ink/5 px-1.5 py-0.5 text-xs">X-API-Key</code> header.
          There are two key types, and each is only authorized for its own endpoints:
        </p>
        <List
          items={[
            <>
              <strong>Dev-level key</strong> (<code className="rounded bg-ink/5 px-1 py-0.5 text-[11px]">client_provisioning</code> scope)
              — issued once per developer. Can only call <code className="rounded bg-ink/5 px-1 py-0.5 text-[11px]">POST /clients</code>.
            </>,
            <>
              <strong>Client-level key</strong> (<code className="rounded bg-ink/5 px-1 py-0.5 text-[11px]">stock_management</code> scope)
              — issued per client, when that client is created. Can only call the stock endpoints, scoped to that one client.
            </>,
          ]}
        />
        <Code>{`X-API-Key: ryx_live_<64 hex characters>`}</Code>
      </Section>

      <Section heading="3. Endpoints">
        <p className="font-mono text-xs text-ink-faint">Base URL: https://valoryx.ryxtech.in/api/external</p>
        <div className="mt-3 rounded-xl border border-ink/10 bg-white/60 px-4">
          <Endpoint method="POST" path="/developers/register" scope="public" description="Register as a developer partner" />
          <Endpoint method="POST" path="/clients" scope="dev key" description="Provision a new client, get its stock key back" />
          <Endpoint method="GET" path="/stock" scope="client key" description="Get one product (?product_id=) or list the catalog" />
          <Endpoint method="POST" path="/stock" scope="client key" description="Create a product, or add quantity if it already exists" />
          <Endpoint method="PUT" path="/stock/<product_id>" scope="client key" description="Update a product's fields" />
          <Endpoint method="DELETE" path="/stock/<product_id>" scope="client key" description="Delete a product" />
          <Endpoint method="POST" path="/stock/reduce" scope="client key" description="Atomically reduce stock by a quantity" />
          <Endpoint method="POST" path="/stock/upload" scope="client key" description="Bulk create/update from a CSV or Excel file" />
          <Endpoint method="GET" path="/stock/lookup/<code>" scope="client key" description="Look up by barcode, item code, or product name" />
        </div>
      </Section>

      <Section heading="4. Example — provision a client">
        <Code>{`curl -X POST https://valoryx.ryxtech.in/api/external/clients \\
  -H "X-API-Key: ryx_live_<your dev key>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "client_name": "Kumar Electronics",
    "email": "kumar@example.com",
    "phone": "9876543210"
  }'`}</Code>
        <p className="mt-3">Response — save the <code className="rounded bg-ink/5 px-1.5 py-0.5 text-xs">api_key</code> now, it will not be shown again:</p>
        <Code>{`{
  "client_id": "7c14ea33-4180-4c51-ba6b-4a1903cbbae0",
  "client_name": "Kumar Electronics",
  "api_key": "ryx_live_<client stock key>",
  "message": "Save this API key now — it will not be shown again."
}`}</Code>
      </Section>

      <Section heading="5. Example — reduce stock on a sale">
        <Code>{`curl -X POST https://valoryx.ryxtech.in/api/external/stock/reduce \\
  -H "X-API-Key: ryx_live_<client stock key>" \\
  -H "Content-Type: application/json" \\
  -d '{ "product_id": "<product_id>", "quantity": 2 }'`}</Code>
        <p className="mt-3">
          The reduction is atomic — if two requests race for the last units, only one succeeds.
          If stock is insufficient you get back <code className="rounded bg-ink/5 px-1.5 py-0.5 text-xs">409</code> with the
          amount actually available.
        </p>
      </Section>

      <Section heading="6. Example — bulk stock upload">
        <p>
          Send a CSV or Excel file as <code className="rounded bg-ink/5 px-1.5 py-0.5 text-xs">multipart/form-data</code> under
          the field name <code className="rounded bg-ink/5 px-1.5 py-0.5 text-xs">file</code>. Rows are matched by{' '}
          <code className="rounded bg-ink/5 px-1.5 py-0.5 text-xs">product_name</code> — an existing product gets its quantity
          added and its other fields updated; a new name is created.
        </p>
        <List
          items={[
            <><strong>Required columns:</strong> product_name, quantity, rate</>,
            <><strong>Optional columns:</strong> category (defaults to "Other"), unit (defaults to "pcs"), item_code, gst_percentage, hsn_code</>,
            <>Accepted file types: <code className="rounded bg-ink/5 px-1.5 py-0.5 text-xs">.csv</code>, <code className="rounded bg-ink/5 px-1.5 py-0.5 text-xs">.xlsx</code>, <code className="rounded bg-ink/5 px-1.5 py-0.5 text-xs">.xls</code> — limited to 5 uploads/minute.</>,
          ]}
        />
        <Code>{`curl -X POST https://valoryx.ryxtech.in/api/external/stock/upload \\
  -H "X-API-Key: ryx_live_<client stock key>" \\
  -F "file=@products.csv"`}</Code>
        <p className="mt-3">Example <code className="rounded bg-ink/5 px-1.5 py-0.5 text-xs">products.csv</code>:</p>
        <Code>{`product_name,quantity,rate,category,unit,gst_percentage,hsn_code
Laptop Stand,25,899.00,Electronics,pcs,18,8473
USB-C Cable,100,199.50,Electronics,pcs,18,8544
Notebook,50,45.00,Stationery,pcs,12,4820`}</Code>
        <p className="mt-3">Response — a per-row summary, with the first 10 row-level errors if any:</p>
        <Code>{`{
  "success": true,
  "summary": {
    "total_rows": 3,
    "success_count": 3,
    "created_count": 2,
    "updated_count": 1,
    "error_count": 0,
    "errors": []
  }
}`}</Code>
        <p className="mt-3">
          A bad file (missing required columns) fails the whole upload up front with{' '}
          <code className="rounded bg-ink/5 px-1.5 py-0.5 text-xs">400</code>. Row-level problems (e.g. a blank quantity on
          one line) don't fail the batch — that row is skipped and counted in{' '}
          <code className="rounded bg-ink/5 px-1.5 py-0.5 text-xs">error_count</code>/<code className="rounded bg-ink/5 px-1.5 py-0.5 text-xs">errors</code>,
          while the rest of the file still processes.
        </p>
      </Section>

      <Section heading="7. Rate limits & errors">
        <List
          items={[
            <>Every endpoint is rate-limited per API key (client provisioning: 20/min, stock reads/writes: 60–120/min, bulk upload: 5/min).</>,
            <>A missing or revoked key returns <code className="rounded bg-ink/5 px-1.5 py-0.5 text-xs">401</code>.</>,
            <>Using a key for the wrong scope (e.g. a client key calling <code className="rounded bg-ink/5 px-1.5 py-0.5 text-xs">/clients</code>) returns <code className="rounded bg-ink/5 px-1.5 py-0.5 text-xs">403</code> with <code className="rounded bg-ink/5 px-1.5 py-0.5 text-xs">code: "SCOPE_MISMATCH"</code>.</>,
            <>Nothing outside this API surface is reachable with these keys — no billing, users, or reports data.</>,
          ]}
        />
      </Section>

      <div className="rounded-2xl border border-ink/10 bg-canvas p-6 text-center sm:p-8">
        <h3 className="font-heading text-lg font-bold text-ink">Ready to integrate?</h3>
        <p className="mt-1 font-body text-sm text-ink-soft">Registration takes a minute — approval is manual, usually same-day.</p>
        <Link
          to="/developers/register"
          className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-ink px-6 py-3 font-body text-sm font-semibold text-white shadow-pill transition-all hover:scale-[1.03] hover:bg-[#3a4666]"
        >
          Get API Access
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </LegalLayout>
  )
}
