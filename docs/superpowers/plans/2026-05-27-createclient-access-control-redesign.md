# CreateClient Access Control Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **No-commit mode:** The user has instructed that subagents must NOT run `git add` or `git commit`. All "Step N: Commit" steps in this plan are intentionally OMITTED. After each task is implemented and tested, leave the working tree dirty for the user to review and stage manually. Skip the commit step everywhere it would normally appear.

**Goal:** Restructure the CreateClient Access Control section to remove all 13 built-in business templates, surface custom templates as the primary UI, replace the hidden "Advanced" wrapper with an always-visible permissions editor, and add a sticky summary bar with a permission count + always-reachable Save button.

**Architecture:** Backend `get_permission_templates()` shrinks from ~280 lines (13 hardcoded dicts + custom merge) to ~20 lines (custom-only query). Frontend `CreateClient.tsx` Access Control section is rebuilt around 4 stacked regions: role row (unchanged), conditional "Your saved templates" section (hidden when empty), always-visible permissions editor (was inside `<details>`), and a `position: sticky bottom-0` summary bar with the count + Clear selection + Save button.

**Tech Stack:** Flask + SQLAlchemy on backend. React 18 + TypeScript + Tailwind on frontend. Tests: pytest with SQLite `:memory:`.

**Reference spec:** [docs/superpowers/specs/2026-05-27-createclient-access-control-redesign.md](../specs/2026-05-27-createclient-access-control-redesign.md).

**Files in this plan:**

Backend (modified):
- `backend/routes/admin.py` — shrink `get_permission_templates()` from lines ~848-1116 down to ~20 lines
- `backend/tests/test_permission_templates.py` — rename + rewrite one test

Frontend (modified):
- `frontend-react/src/pages/admin/CreateClient.tsx` — three editing tasks (remove unused code, rebuild layout, add sticky bar)

---

## Task 1: Update the affected backend test (red phase)

The current test `test_get_returns_built_ins_when_no_custom_exist` asserts that `'full_access' in templates` after a fresh GET. After Task 2 removes the built-ins, that assertion will fail. Rename the test now (TDD red phase — the test gets rewritten to reflect the new contract, then runs and fails because the implementation hasn't caught up yet).

**Files:**
- Modify: `backend/tests/test_permission_templates.py` — find `test_get_returns_built_ins_when_no_custom_exist` (currently around line 307) and rewrite it.

- [ ] **Step 1: Rewrite the test**

Open `backend/tests/test_permission_templates.py`. Find the existing function:

```python
def test_get_returns_built_ins_when_no_custom_exist(http, super_admin_headers):
    resp = http.get('/api/admin/permission-templates', headers=super_admin_headers)
    assert resp.status_code == 200
    templates = resp.get_json()['templates']
    # The 12 built-ins are still keyed by their string keys.
    assert 'full_access' in templates
    assert 'dress_shop' in templates
    # Built-ins have is_custom: False.
    assert templates['dress_shop']['is_custom'] is False
```

Replace the ENTIRE function body (and rename the function) with:

```python
def test_get_returns_empty_dict_when_no_custom_exist(http, super_admin_headers):
    """After the 2026-05-27 redesign, built-in templates were removed.
    GET returns an empty templates dict when no custom templates have been saved.
    """
    resp = http.get('/api/admin/permission-templates', headers=super_admin_headers)
    assert resp.status_code == 200
    assert resp.get_json()['templates'] == {}
```

- [ ] **Step 2: Run the renamed test to verify it FAILS**

Run: `cd backend && pytest tests/test_permission_templates.py::test_get_returns_empty_dict_when_no_custom_exist -v 2>&1 | tail -10`

Expected: FAIL with `AssertionError` — the response still contains `full_access`, `dress_shop`, etc. because Task 2 hasn't shrunk the endpoint yet.

- [ ] **Step 3: (skip — no-commit mode active)**

---

## Task 2: Shrink `get_permission_templates()` to custom-only

Delete the 13 hardcoded built-in template dicts and reduce the function to a single SQL query against `permission_templates`.

**Files:**
- Modify: `backend/routes/admin.py` — replace lines ~848-1119 (the entire `get_permission_templates` function body) with the shorter version.

- [ ] **Step 1: Read the current function to confirm its line range**

Run: `grep -n "def get_permission_templates\|# CLIENT MANAGEMENT" backend/routes/admin.py | head -5`

Expected: two lines — the start of `def get_permission_templates` and the next section header `# CLIENT MANAGEMENT ENDPOINTS FOR SUPER ADMIN` (which marks where to stop deleting).

- [ ] **Step 2: Replace the function body**

The function is currently:

```python
@admin_bp.route('/permission-templates', methods=['GET'])
@authenticate
@require_super_admin
def get_permission_templates():
    """Get permission templates/presets for different business types"""
    try:
        templates = {
            'full_access': { ... },
            'dress_shop': { ... },
            # ... 11 more built-in dicts ...
            'view_only': { ... },
        }

        # Tag built-ins with is_custom: False
        for key, t in templates.items():
            t['is_custom'] = False

        # Merge in active custom templates (Phase 2)
        custom = PermissionTemplate.query.filter(...)
        # ... batch creator email fetch ...
        for t in custom:
            templates[str(t.template_id)] = t.to_dict(...)

        return jsonify({'templates': templates}), 200

    except Exception as e:
        return jsonify({'error': f'Failed to fetch permission templates: {str(e)}'}), 500
```

Replace the entire function (from `@admin_bp.route('/permission-templates', methods=['GET'])` through and INCLUDING the `except Exception as e: return jsonify(...)` block) with this:

```python
@admin_bp.route('/permission-templates', methods=['GET'])
@authenticate
@require_super_admin
def get_permission_templates():
    """Return the super admin's saved custom permission templates.

    Built-in business templates were removed in the 2026-05-27 redesign;
    only user-defined templates are returned now. Frontend CreateClient
    treats every entry as a custom template.
    """
    try:
        custom = PermissionTemplate.query.filter(
            PermissionTemplate.deleted_at.is_(None)
        ).all()

        # Batch-fetch creator emails to avoid N+1.
        creator_ids = {str(t.created_by) for t in custom}
        creators = (
            User.query.with_entities(User.user_id, User.email)
            .filter(User.user_id.in_(creator_ids))
            .all()
            if creator_ids else []
        )
        email_by_id = {str(uid): email for uid, email in creators}

        templates = {
            str(t.template_id): t.to_dict(
                created_by_email=email_by_id.get(str(t.created_by))
            )
            for t in custom
        }
        return jsonify({'templates': templates}), 200

    except Exception as e:
        return jsonify({'error': f'Failed to fetch permission templates: {str(e)}'}), 500
```

The replaced block is ~280 lines, the new version is ~30 lines. Use the Edit tool with a sufficiently large `old_string` to match uniquely; if Edit fails because the block is too long for a single match, use multiple Edit calls — first delete the built-in dicts (between `templates = {` and the closing `}` before `# Tag built-ins`), then replace the merge logic separately.

- [ ] **Step 3: Run the renamed test to verify it PASSES**

Run: `cd backend && pytest tests/test_permission_templates.py::test_get_returns_empty_dict_when_no_custom_exist -v 2>&1 | tail -10`

Expected: PASS.

- [ ] **Step 4: Run the full permission_templates test file to confirm no other test broke**

Run: `cd backend && pytest tests/test_permission_templates.py -v 2>&1 | tail -30`

Expected: 24 passed (the renamed test plus the other 23 from Phase 2 — POST, PUT, DELETE, and the 3 remaining GET tests that test custom-template behavior).

- [ ] **Step 5: Run a broader backend sweep to confirm nothing else asserted on a built-in key**

Run: `cd backend && pytest tests/test_permission_templates.py tests/test_permissions.py tests/test_billing.py tests/test_migration_022.py -q 2>&1 | tail -10`

Expected: all pass.

- [ ] **Step 6: (skip — no-commit mode active)**

---

## Task 3: Frontend cleanup — remove unused code

Three small deletions in `CreateClient.tsx` to make Task 4's layout rebuild cleaner. None of these deletions break anything on their own (the surrounding code still compiles), but they remove ~110 lines of code we won't need.

**Files:**
- Modify: `frontend-react/src/pages/admin/CreateClient.tsx` — three small removals.

- [ ] **Step 1: Remove unused lucide-react icon imports**

The current import block (around lines 8-36) imports 11 icons that were used only by the built-in template `getIcon()` mapping function: `Store`, `ShoppingCart`, `Utensils`, `Coffee`, `Apple`, `Pill`, `Smartphone`, `Hammer`, `Gem`, `Users`, `Eye`. After Task 3 Step 2 deletes `getIcon`, these icons are unused.

Open `frontend-react/src/pages/admin/CreateClient.tsx`. Find the lucide-react import block (currently lines 8-36 — verify with `grep -n "from 'lucide-react'" frontend-react/src/pages/admin/CreateClient.tsx`). Remove these icon names from the import list:

- `Store`
- `ShoppingCart`
- `Utensils`
- `Coffee`
- `Apple`
- `Pill`
- `Smartphone`
- `Hammer`
- `Gem`
- `Eye`

KEEP `Users` because it's likely used by the "Team Member Quotas" section heading further down. Verify with: `grep -n "Users[ )]" frontend-react/src/pages/admin/CreateClient.tsx | head -5`. If `Users` only appears in the import line (no other usages), also remove it; otherwise keep it.

Also KEEP: `Building2`, `Mail`, `Phone`, `MapPin`, `FileText`, `Image`, `ArrowLeft`, `Save`, `AlertCircle`, `User`, `Lock`, `Key`, `Shield`, `RefreshCw`, `Check`, `Plus` — these are still used elsewhere in the file.

- [ ] **Step 2: Remove the `getIcon()` function and the Icon usage in the card render**

Inside the `Object.entries(permissionTemplates).map(([key, template]) => { ... })` loop (around lines 733-770), the current code has:

```tsx
{Object.entries(permissionTemplates).map(([key, template]) => {
  const getIcon = () => {
    if (key === 'dress_shop') return Store;
    if (key === 'supermarket') return ShoppingCart;
    if (key === 'general_store') return Store;
    if (key === 'food_store') return Coffee;
    if (key === 'restaurant_hotel') return Utensils;
    if (key === 'fruit_vegetable_stall') return Apple;
    if (key === 'medical_pharmacy') return Pill;
    if (key === 'electronics_store') return Smartphone;
    if (key === 'hardware_store') return Hammer;
    if (key === 'jewelry_store') return Gem;
    if (key === 'staff_cashier') return Users;
    if (key === 'view_only') return Eye;
    return Shield;
  };
  const Icon = getIcon();
  const isSelected = selectedTemplate === key;

  return (
    <button ...>
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${isSelected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
          <Icon className="w-5 h-5" />
        </div>
        ...
```

Replace with (delete `getIcon()` and `const Icon = getIcon();`; replace `<Icon ... />` with a constant `<Shield ... />`):

```tsx
{Object.entries(permissionTemplates).map(([key, template]) => {
  const isSelected = selectedTemplate === key;

  return (
    <button ...>
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${isSelected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
          <Shield className="w-5 h-5" />
        </div>
        ...
```

(All custom templates get the same Shield icon. Visual variation per template is provided by the name and "Created by" caption.)

- [ ] **Step 3: Remove the "Selected template info" callout**

After the template grid (around lines 773-787), the current code has:

```tsx
{selectedTemplate && (
  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
    <div className="flex items-start gap-2">
      <Check className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-medium text-blue-900">
          Selected: {permissionTemplates[selectedTemplate]?.name}
        </p>
        <p className="text-xs text-blue-700 mt-1">
          {permissionTemplates[selectedTemplate]?.permissions.length} permissions will be assigned to the admin user
        </p>
      </div>
    </div>
  </div>
)}
```

Delete this entire `{selectedTemplate && (...)}` block. The new sticky bar (Task 5) shows this info more prominently and continuously.

- [ ] **Step 4: Remove the `<details>` "Advanced" wrapper around the permissions editor**

Around lines 842-878, find this `<details>` block:

```tsx
{Object.keys(groupedPermissions).length > 0 && (
  <details className="mt-6">
    <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-blue-600 flex items-center gap-2">
      <span>Advanced: Customize Individual Permissions</span>
      <span className="text-xs text-gray-500">(Optional - for fine-tuning)</span>
    </summary>
    <div className="mt-4 space-y-4">
      <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-xs text-yellow-800">
          <strong>Note:</strong> Selecting a business type template is recommended. Only customize individual permissions if you need specific control beyond the template.
        </p>
      </div>
      {Object.entries(groupedPermissions).map(([category, permissions]) => (
        <div key={category} className="border border-gray-200 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-2 capitalize">{category}</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {(permissions as any[]).map((perm: any) => (
              <label key={perm.permission_name} className="group flex items-center gap-2 hover:bg-gray-50 p-1 rounded">
                <input ... />
                <span ...>{perm.description}</span>
                <PermissionHelpTooltip permissionName={perm.permission_name} />
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  </details>
)}
```

Replace with (remove the `<details>` and `<summary>` wrappers, remove the yellow "Note" callout that pushed admins toward templates, keep the perm grid as a top-level section):

```tsx
{Object.keys(groupedPermissions).length > 0 && (
  <div className="mt-6">
    <h3 className="text-sm font-medium text-gray-900 mb-3">Permissions</h3>
    <div className="space-y-4">
      {Object.entries(groupedPermissions).map(([category, permissions]) => (
        <div key={category} className="border border-gray-200 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-2 capitalize">{category}</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {(permissions as any[]).map((perm: any) => (
              <label key={perm.permission_name} className="group flex items-center gap-2 hover:bg-gray-50 p-1 rounded">
                <input
                  type="checkbox"
                  checked={selectedPermissions.includes(perm.permission_name)}
                  onChange={() => handlePermissionToggle(perm.permission_name)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 flex-1">{perm.description}</span>
                <PermissionHelpTooltip permissionName={perm.permission_name} />
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 5: Verify the build still passes**

Run: `cd frontend-react && npm run build 2>&1 | tail -10`

Expected: build succeeds. If TypeScript complains about an unused import, that means an icon you didn't remove in Step 1 is actually unused — remove it now.

- [ ] **Step 6: (skip — no-commit mode active)**

---

## Task 4: Frontend layout rebuild — restructure into 4 regions

With Task 3's cleanup done, the Access Control section now has: role row, template grid, (the Selected callout is gone), permissions editor. Now wrap the template grid in a conditional "Your saved templates" header, and remove the old "Save as template…" button row (which will be moved into the sticky bar in Task 5).

**Files:**
- Modify: `frontend-react/src/pages/admin/CreateClient.tsx`.

- [ ] **Step 1: Add a header to the template grid + hide it when empty**

Around line 710-770, the current template grid block looks like:

```tsx
<div className="mt-6">
  <label className="block text-sm font-medium text-gray-700 mb-3">
    Select Business Type & Permissions
  </label>
  <p className="text-xs text-gray-500 mb-4">
    Choose a business template that matches your client&apos;s industry. This will automatically assign appropriate permissions.
  </p>

  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
    {Object.entries(permissionTemplates).map(([key, template]) => {
      ...
    })}
  </div>
</div>
```

Replace with:

```tsx
{Object.keys(permissionTemplates).length > 0 && (
  <div className="mt-6">
    <label className="block text-sm font-medium text-gray-700 mb-3">
      Your saved templates ({Object.keys(permissionTemplates).length})
    </label>
    <p className="text-xs text-gray-500 mb-4">
      Click a template to apply its permissions, then tweak below if needed.
    </p>

    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {Object.entries(permissionTemplates).map(([key, template]) => {
        ...
      })}
    </div>
  </div>
)}
```

The whole block now renders only when `Object.keys(permissionTemplates).length > 0`. First-time users (no custom templates yet) see no template section at all.

- [ ] **Step 2: Remove the now-orphaned "Save as template…" button row**

Around lines 830-841, the current code has the standalone Save button:

```tsx
<div className="mt-4 flex justify-end">
  <button
    type="button"
    onClick={() => setSaveDialog({ mode: 'create' })}
    disabled={selectedPermissions.length === 0}
    className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 text-white rounded-lg text-sm hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
  >
    <Save className="h-4 w-4" />
    Save as template…
  </button>
</div>
```

Delete this entire block. The Save button moves into the sticky bar in Task 5.

- [ ] **Step 3: Verify the build still passes**

Run: `cd frontend-react && npm run build 2>&1 | tail -10`

Expected: build succeeds.

- [ ] **Step 4: (skip — no-commit mode active)**

---

## Task 5: Add the sticky summary bar + Clear selection handler

Add a small `handleClearSelection` callback and an inline sticky-bottom summary bar at the bottom of the Access Control card. The bar shows the perm count, a "Clear selection" text link (only when there's something to clear), and the "Save as template…" button.

**Files:**
- Modify: `frontend-react/src/pages/admin/CreateClient.tsx`.

- [ ] **Step 1: Add the Clear selection handler near the other handlers**

Find `handlePermissionToggle` (around line 175). Immediately after its closing `};`, add:

```tsx
const handleClearSelection = () => {
  setSelectedPermissions([]);
  setSelectedTemplate('');
};
```

- [ ] **Step 2: Mount the sticky bar at the bottom of the Access Control card**

Locate the closing `</div>` of the Access Control card. The structure is roughly:

```tsx
{/* Access Control */}
<div className="bg-white rounded-lg shadow p-6">
  {/* role + status row */}
  ...
  {/* templates section */}
  ...
  {/* permissions editor */}
  ...
</div>  {/* ← end of Access Control card */}
```

Right BEFORE the closing `</div>` of the Access Control card (after the permissions editor block from Task 3 Step 4), add this sticky bar:

```tsx
<div
  className="sticky bottom-0 -mx-6 -mb-6 mt-6 px-6 py-3 bg-white border-t border-gray-200 rounded-b-lg flex items-center justify-between gap-3"
  style={{ boxShadow: '0 -2px 8px rgba(0,0,0,0.04)' }}
>
  <div className="flex items-center gap-3 text-sm">
    <span className="font-medium text-gray-700">
      🔑 {selectedPermissions.length} permissions selected
    </span>
    {selectedPermissions.length > 0 && (
      <button
        type="button"
        onClick={handleClearSelection}
        className="text-xs text-gray-500 hover:text-red-600 underline"
      >
        Clear selection
      </button>
    )}
  </div>
  <button
    type="button"
    onClick={() => setSaveDialog({ mode: 'create' })}
    disabled={selectedPermissions.length === 0}
    className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 text-white rounded-lg text-sm hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
  >
    <Save className="h-4 w-4" />
    Save as template…
  </button>
</div>
```

Notes on the styling:
- `sticky bottom-0`: pins to the bottom of the scroll container.
- `-mx-6 -mb-6 px-6` and `rounded-b-lg`: cancels the card's `p-6` so the bar runs edge-to-edge and reuses the card's rounded bottom corners.
- `border-t`: subtle separator from the permissions editor above.
- The `style={{ boxShadow }}` adds a soft upward shadow so the bar feels detached when content scrolls beneath it.

- [ ] **Step 3: Verify the build**

Run: `cd frontend-react && npm run build 2>&1 | tail -10`

Expected: build succeeds.

- [ ] **Step 4: Confirm sticky behavior by viewing the file structure**

Run: `grep -n "sticky bottom-0\|handleClearSelection\|Clear selection" frontend-react/src/pages/admin/CreateClient.tsx | head -10`

Expected: shows the new handler declaration + the sticky div + the Clear selection button.

- [ ] **Step 5: (skip — no-commit mode active)**

---

## Task 6: Manual end-to-end verification

No code changes — real browser test of the redesigned flow. Phase 2 already has the SaveTemplateDialog and CustomTemplateActions, and they shouldn't need re-testing in isolation. This task verifies the integrated UX.

- [ ] **Step 1: Start the backend**

Run: `cd backend && python app.py`

Expected: server starts on port 5017. No new migration runs (the schema is already at v22). The templates endpoint now returns custom templates only.

- [ ] **Step 2: Start the frontend**

Run: `cd frontend-react && npm run dev`

Expected: dev server on http://localhost:3002/frontend/.

- [ ] **Step 3: First-time experience (delete any pre-existing custom templates first)**

If you have existing custom templates from earlier Phase 2 testing, delete them via the API or via the UI's hover-delete affordance. Then navigate to `/admin/clients/create`.

Expected on the Access Control card:
- Role/status row at the top, unchanged.
- NO "Your saved templates" section visible (no built-ins anymore + no custom templates yet).
- "Permissions" header followed by the grouped checkbox editor — always visible, no `<details>` toggle.
- Sticky bar at the bottom: "🔑 0 permissions selected" + disabled "Save as template…" button. No "Clear selection" link (only appears when perms > 0).

- [ ] **Step 4: Save a custom template**

- Tick a few permissions in the editor (e.g. `gst_billing`, `apply_discount`, `view_customers`).
- Confirm the sticky bar updates to "🔑 3 permissions selected" and a "Clear selection" link appears.
- Confirm the Save button is now enabled.
- Click Save → modal appears → name it "Test Template" → submit.

Expected:
- Modal closes.
- "Your saved templates (1)" section appears at the top with one card.
- The new template is auto-selected (blue border).
- Sticky bar still shows "🔑 3 permissions selected".

- [ ] **Step 5: Apply, tweak, save as new**

- Click the "Test Template" card to confirm it applies its permissions (the editor checkboxes don't change visibly since they were already set).
- Tick one additional perm in the editor.
- Click "Save as template…" in the sticky bar.
- Name the new one "Test Template+" and save.

Expected: a second card appears in "Your saved templates (2)". The first template is untouched (the sticky-bar Save always creates a NEW template — to edit the existing one in place, hover its card and click ✏️).

- [ ] **Step 6: Edit an existing template via hover**

- Hover the "Test Template" card → ✏️ and 🗑️ icons fade in at the top-right.
- Click ✏️ → modal opens in edit mode pre-filled with the template's name.
- Change name to "Test Template (edited)" → save.

Expected: card title updates to "Test Template (edited)".

- [ ] **Step 7: Delete a template**

- Hover "Test Template+" → click 🗑️ → inline confirm popover appears.
- Click Delete.

Expected: card disappears. If it was selected, the editor's selectedPermissions is cleared (Phase 2 `onDeleted` callback behavior).

- [ ] **Step 8: Clear selection**

- Click any card to apply its permissions.
- Click "Clear selection" in the sticky bar.

Expected: all checkboxes in the editor become unchecked. Sticky bar shows "🔑 0 permissions selected", "Clear selection" link disappears, Save button becomes disabled.

- [ ] **Step 9: Sticky bar behavior on long scroll**

- Save a large template (e.g. one with 50+ permissions) so the permissions editor becomes long enough to scroll.
- Scroll down through the categories.

Expected: the sticky bar stays visible at the bottom of the Access Control card (or the viewport, depending on where the card ends). The user can always see the count and reach the Save button without scrolling back up.

- [ ] **Step 10: Mobile / narrow viewport**

- Open browser devtools, switch to 375×667 (iPhone SE).
- Reload CreateClient.

Expected: layout adapts (grid becomes 1 column), sticky bar still works, edit/delete icons on custom cards still visible (Phase 2 handled the touch case).

- [ ] **Step 11: End-to-end client creation**

- Pick a custom template.
- Fill in client + user fields.
- Click "Create Client".
- Log in as the new owner (not super_admin).
- Try to do something the template grants permission for (e.g. create a bill).

Expected: works without 403. Confirms the full pipeline — template → /admin/users with permissions[] → UserPermission rows → route guards — is intact.

---

## Done criteria

The redesign is shippable when ALL of these hold:

1. `cd backend && pytest tests/test_permission_templates.py -v` → 24 passed (renamed test now passes + the other 23 from Phase 2).
2. `cd backend && pytest -x` → all green (or only the known pre-existing `test_security_headers_present` failure).
3. `cd frontend-react && npm run build` → success, no TS errors, no unused-import warnings.
4. Manual verification (Task 6) passes for all 11 sub-steps.
5. The race-condition bug (Full Access selected → Save stays disabled) no longer reproduces because the trigger no longer exists.

Once shippable, the user can review the working tree and stage/commit at their discretion. The paused "Salary perms gap" todo resumes after this lands.
