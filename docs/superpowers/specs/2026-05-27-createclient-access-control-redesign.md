# CreateClient Access Control Redesign

**Date:** 2026-05-27
**Status:** Approved scope, awaiting plan
**Surface:** `frontend-react/src/pages/admin/CreateClient.tsx`, `backend/routes/admin.py` (templates endpoint)
**Builds on:** Phase 2 (custom permission templates), template-fix, Phase 1.5 leak fix
**Supersedes:** the dual built-in + custom design from Phase 2's spec

---

## 1. Background & problem

Phase 2 shipped custom permission templates on the CreateClient page. The current layout mixes the user's saved custom templates into the same grid as 13 hardcoded built-in business templates (Dress Shop, Pharmacy, Restaurant, etc.). After using the feature, the product owner has identified three concrete problems:

1. **The "Save as template…" button is silently broken under common conditions.** It's disabled when `selectedPermissions.length === 0`. Because templates are fetched async and applied via a click handler that reads `permissionTemplates[key]` at click-time, picking a template before the templates dict has loaded sets `selectedTemplate` correctly but leaves `selectedPermissions` empty. Result: the card looks selected (blue border) but Save stays disabled. The bug is timing-sensitive and confusing.

2. **The flow buries customization behind "Advanced: Customize Individual Permissions".** Picking a template applies its perms but gives no visible feedback — you have to expand a collapsed section to see what got applied or tweak anything. There's no running summary, no diff against the picked template, and no clear "I'm done customizing" affordance.

3. **The 13 built-in templates are clutter.** The product owner's actual workflow is **re-using their own saved templates** — every new client is configured from one of a handful of custom presets. The built-in industry templates (Dress Shop / Pharmacy / Hardware / Jewelry / etc.) were a Phase 2 starter library that the team doesn't actually use. They take up most of the grid's visual real estate and push the user's own templates down. They also carry maintenance cost (the dot-notation mapping bug from earlier in this project's history was caused by stale built-in template definitions).

This spec replaces the dual-grid layout with a custom-only flow that puts the user's own templates first and surfaces the permissions editor as the primary editing surface.

---

## 2. Goals & non-goals

**Goals**
1. Eliminate all 13 built-in templates from both backend response and frontend rendering.
2. Surface custom templates (the user's saved presets) as the primary template UI.
3. Make the permissions editor always visible (no longer hidden behind an `<details>` "Advanced" wrapper) so picking a template gives immediate visual feedback.
4. Add a sticky summary bar with a permission-count display and an always-reachable Save button.
5. First-time experience (zero custom templates yet) is clean — no empty grid, just the permissions editor and Save.
6. Naturally eliminate the disabled-Save race condition by removing the template-click-before-loaded code path entirely.

**Non-goals**
- No changes to the existing `SaveTemplateDialog`, `CustomTemplateActions`, `PermissionHelpTooltip`, or `permissionTemplateService` (Phase 2 components remain unchanged).
- No drag-to-reorder of custom templates (alphabetical or created_at sort is fine for v1).
- No template categories, tags, or filtering (premature at single-digit volume).
- No bulk-import / export of templates.
- No changes to the CreateUser or EditUser screens — this is CreateClient-only.
- No changes to the underlying `permission_templates` table schema (Migration v22 unchanged).
- No changes to authorization rules (still `@require_super_admin` on all endpoints).
- The Role / Make Super Admin / Account Active controls at the top of Access Control are unchanged.
- The Team Member Quotas section below Access Control is unchanged.

---

## 3. New UI structure

The Access Control card on CreateClient is restructured into 4 stacked regions (top to bottom):

1. **Role + status row** — unchanged from current. The existing two-column layout with the Owner badge and the Make Super Admin / Account Active checkboxes.
2. **Your saved templates** — a section that renders only when at least one active custom template exists. Heading: "Your saved templates (N)". Grid of `CustomTemplateActions`-equipped cards. Clicking a card applies its `permissions` to `selectedPermissions` and stores `selectedTemplate = template_id`. Each card retains the hover-to-show edit (✏️) and delete (🗑️) icons from Phase 2.
3. **Permissions editor** — always visible. The grouped checkbox grid that was previously inside `<details>` "Advanced: Customize Individual Permissions". The `<details>` wrapper is removed entirely. Each row continues to use the Phase 1 `PermissionHelpTooltip` for per-permission help.
4. **Sticky summary bar** — pinned at the bottom of the Access Control card via `position: sticky; bottom: 0`. Shows the count "🔑 N permissions selected" on the left and the "💾 Save as template…" button on the right. The button is disabled when `selectedPermissions.length === 0` (same condition as today, but now visible enough that the disabled state is informative instead of confusing).

### First-time experience (zero custom templates)

- The "Your saved templates" section is hidden entirely (not rendered, not a placeholder).
- The Permissions editor is the first thing the admin sees inside Access Control after Role/status.
- The Sticky summary bar shows "🔑 0 permissions selected" + a disabled Save button until the admin ticks at least one permission.

### Returning experience (one or more custom templates)

- "Your saved templates" appears at the top. Click a card → permissions populate in the editor below → submit client creation. Two clicks for the common path.
- If the admin wants to tweak: pick template → edit perms in the editor → click "Save as template…" in the sticky bar → modal opens in **create mode** and saves a NEW template (the sticky-bar Save button always creates; this matches Phase 2's behavior).
- To edit the EXISTING template in place: hover its card and click the ✏️ icon (unchanged from Phase 2 — `CustomTemplateActions` opens the dialog in edit mode).

### Picking a template after the editor has changes

When `selectedPermissions.length > 0` and the user clicks a saved template, the new perms **replace** the current selection without confirmation. This matches the existing Phase 2 behavior and avoids modal fatigue on a screen that's already busy. If the user accidentally clicks a template, they can re-pick the original or hit "Clear selection" (a small text link next to the count in the sticky bar — see 3.5).

### 3.5 Sticky summary bar — details

Left side:
- "🔑 N permissions selected" — live count
- Below the count, when `selectedTemplate` is set: small text "from <template name>" linking to the template's card via scroll-to (nice-to-have; can be plain text if scroll-to adds complexity).
- A small text link "Clear selection" — appears only when `selectedPermissions.length > 0`. Resets `selectedPermissions = []` and `selectedTemplate = ''`. No confirmation; one-click undo.

Right side:
- "💾 Save as template…" button. Disabled when `selectedPermissions.length === 0`.

Styling:
- `position: sticky; bottom: 0` so the bar stays visible while the user scrolls through long permission categories.
- A subtle top border / shadow so it visually separates from the editor above.
- Card-themed background (matches the surrounding panel) so it doesn't feel detached.

---

## 4. Backend changes

### 4.1 Endpoint shrinkage

`GET /admin/permission-templates` in [backend/routes/admin.py:848-1116](../../../backend/routes/admin.py#L848-L1116) currently constructs a dict with 13 hardcoded built-in templates and merges in active custom templates. After this redesign, the function returns custom templates only.

New shape (much smaller):

```python
@admin_bp.route('/permission-templates', methods=['GET'])
@authenticate
@require_super_admin
def get_permission_templates():
    """Get the super admin's custom permission templates (built-ins removed in 2026-05-27 redesign)."""
    try:
        custom = PermissionTemplate.query.filter(
            PermissionTemplate.deleted_at.is_(None)
        ).all()
        creator_ids = {str(t.created_by) for t in custom}
        creators = (
            User.query.with_entities(User.user_id, User.email)
            .filter(User.user_id.in_(creator_ids))
            .all()
            if creator_ids else []
        )
        email_by_id = {str(uid): email for uid, email in creators}

        templates = {
            str(t.template_id): t.to_dict(created_by_email=email_by_id.get(str(t.created_by)))
            for t in custom
        }
        return jsonify({'templates': templates}), 200
    except Exception as e:
        return jsonify({'error': f'Failed to fetch permission templates: {str(e)}'}), 500
```

The full ~270-line block of built-in template definitions is deleted.

### 4.2 Test updates

- **`test_get_returns_built_ins_when_no_custom_exist`** in [backend/tests/test_permission_templates.py](../../../backend/tests/test_permission_templates.py) — rename to `test_get_returns_empty_dict_when_no_custom_exist`. Body becomes:
  ```python
  resp = http.get('/api/admin/permission-templates', headers=super_admin_headers)
  assert resp.status_code == 200
  assert resp.get_json()['templates'] == {}
  ```
- All other backend tests (POST, PUT, DELETE, custom GET tests) are unchanged — they don't reference built-ins.

### 4.3 What stays the same

- `permission_templates` table (Migration v22) — unchanged.
- `PermissionTemplate` model — unchanged.
- POST/PUT/DELETE endpoints — unchanged.
- Validation helper `_validate_template_payload` — unchanged.
- `SUPER_ADMIN_ONLY_PERMISSIONS` stripping — unchanged.

---

## 5. Frontend changes

### 5.1 Files modified

- **`frontend-react/src/pages/admin/CreateClient.tsx`** — the only React file with substantial edits (~150 lines removed, ~80 lines added).

### 5.2 What to remove

- The `getIcon()` lookup function and all 13 built-in template icon imports (`Store`, `ShoppingCart`, `Utensils`, `Coffee`, `Apple`, `Pill`, `Smartphone`, `Hammer`, `Gem`, `Eye` — at [CreateClient.tsx:25-35](../../../frontend-react/src/pages/admin/CreateClient.tsx#L25-L35)). Only icons actually used in the new design remain.
- The `<details>` "Advanced: Customize Individual Permissions" wrapper around the permission grid. The inner perm rows stay, the wrapper goes.
- The "Selected template info" callout (the blue box that shows "Selected: X — N permissions will be assigned") — replaced by the sticky summary bar.

### 5.3 What to add

- A new section titled "Your saved templates (N)" rendered conditionally on `Object.keys(permissionTemplates).length > 0`. Reuses the existing template-card render logic from the Object.entries loop, minus the built-in conditional (since every template is now custom).
- A sticky summary bar component (inline in CreateClient.tsx, not a separate file — small enough). Renders inside the Access Control card, positioned `sticky bottom-0`, contains the count + "Clear selection" link + Save button.

### 5.4 What stays the same

- `<SaveTemplateDialog>` — mounted exactly as today; `mode='create'` or `mode='edit'` based on `saveDialog` state.
- `<CustomTemplateActions>` — still applied to each card (since all templates are custom now, all cards get the overlay).
- `<PermissionHelpTooltip>` — still applied to each perm row.
- `fetchPermissionTemplates` callback — unchanged. After backend changes, the response just contains custom templates.
- The "Created by: <email>" caption on each card — unchanged.
- `handleTemplateChange`, `handlePermissionToggle` — unchanged. The race-condition bug naturally goes away because there's no auto-applied default template anymore (the user explicitly clicks).

### 5.5 State changes

- `selectedTemplate` state is preserved. It's now always a `template_id` (UUID) since built-ins no longer exist.
- `selectedPermissions` state is preserved.
- `saveDialog` state is preserved.

### 5.6 New small additions

- A "Clear selection" handler:
  ```typescript
  const handleClearSelection = () => {
    setSelectedPermissions([]);
    setSelectedTemplate('');
  };
  ```

That's the entirety of new frontend behavior. The rest is structural rearrangement.

---

## 6. Cross-cutting concerns

### 6.1 The race-condition bug fix

The Full Access disabled-Save bug is fixed implicitly by this redesign. Mechanism: the bug required (a) templates fetched async after page mount, (b) user clicks a template before fetch completes, (c) click handler reads `permissionTemplates[key]` which is still `undefined`, (d) falls into `else` branch and sets `selectedPermissions = []`.

After the redesign:
- The "Your saved templates" section renders conditionally on `Object.keys(permissionTemplates).length > 0`. Until templates load, the section isn't visible — there's no card for the user to click before data is ready.
- Even if a user finds a way to click a custom card during the loading window, the templates dict is the only source of templates (no hardcoded built-ins anymore), so the same fetch that populates the grid populates `permissionTemplates`.
- No additional code is needed to fix the bug.

### 6.2 Sync to Supabase

Unchanged from Phase 2: custom templates remain local-only (sync deferred per Phase 2 spec section 5.4). Removing built-ins doesn't affect this — built-ins were never synced; they were always returned from in-memory Python dicts.

### 6.3 Backward compatibility

- **Existing user permission grants** are untouched. The redesign only changes which templates appear in the UI, not what permissions any user has been granted.
- **Existing custom templates** are untouched. Their rows in `permission_templates` continue to be returned by GET.
- **API contract for the templates endpoint** changes shape only in that the dict no longer contains the 13 hardcoded keys (`full_access`, `dress_shop`, etc.). Any external code (browser extensions, scripts) that hardcoded a built-in key would break, but no such code exists per project memory.

### 6.4 Defense in depth (super-admin perms)

The Phase 1.5 leak fix still applies: when a custom template's permissions are applied via `POST /admin/users`, the backend strips super-admin-only perms if the new user is not super_admin. No change needed here.

---

## 7. Testing strategy

**Backend**
- Update `test_get_returns_built_ins_when_no_custom_exist` → `test_get_returns_empty_dict_when_no_custom_exist`. Assert templates dict is empty.
- All other Phase 2 tests pass unchanged (POST/PUT/DELETE/custom GET).
- Run full backend suite to confirm no other test asserts on a built-in key (project memory and a `grep` of test files indicates no such test exists, but verify).

**Frontend**
- No new component tests needed — `SaveTemplateDialog` and `permissionTemplateService` tests are unchanged.
- Manual verification on dev server:
  1. **First-time flow (delete all custom templates first via DELETE endpoint):** open CreateClient → confirm "Your saved templates" section is hidden, permissions editor is visible, sticky bar shows "0 permissions selected" with disabled Save.
  2. **Tick perms → Save:** select a few perms via the editor → confirm sticky bar count updates → click Save → modal appears → name and save → confirm card appears in newly-visible "Your saved templates" section.
  3. **Re-use flow:** click a saved template card → confirm permissions populate in editor → confirm sticky bar count updates → confirm Save button enabled.
  4. **Clear selection:** click "Clear selection" in sticky bar → confirm count returns to 0 and editor is clean.
  5. **Edit a template:** hover a card → click ✏️ → modal pre-fills → save → confirm card name updates.
  6. **Delete a template:** hover → click 🗑️ → confirm popover → confirm card disappears → if it was selected, confirm permissions are cleared.

---

## 8. Open questions

None at design-time. The plan author will resolve minor implementation details inline (specifically: the exact sticky bar Tailwind classes, whether to use `<aside>` semantic markup for the saved-templates section, and the precise empty-state copy if any).

---

## 9. Out of scope / future work

- **Drag-to-reorder of custom templates** — sorted by `created_at DESC` (newest first) per Phase 2 spec.
- **Template categories or tags** — premature at single-digit template counts.
- **Bulk import/export of templates** — same.
- **A separate "Manage all templates" admin page** — Phase 2 explicitly decided against this; redesign doesn't change that.
- **Restoring built-in templates as an opt-in setting** — they're being deleted, not feature-flagged. If you change your mind, restore via git.
- **CreateUser / EditUser screens** — same flow improvements would arguably help there too, but those screens are out of scope for this spec.
- **Salary-perm gap** (10 perms checked by route guards but not seeded) — paused on a separate todo, will resume after this lands.

---

## 10. Implementation order (recommendation for plan author)

Suggested sequencing:

1. **Backend test update** — rename and rewrite the one affected test first, confirm it fails (currently the test would pass because built-ins are still there).
2. **Backend endpoint rewrite** — delete the 13 built-in dicts and shrink `get_permission_templates` to the ~20-line version above. Confirm the updated test passes.
3. **Frontend cleanup** — remove the `<details>` wrapper, the icon mapping function, and the unused icon imports.
4. **Frontend layout rebuild** — restructure the Access Control card into the 4-region layout (role row, saved templates section, permissions editor, sticky summary bar).
5. **Sticky summary bar inline component** — count + Clear selection link + Save button.
6. **Manual verification** — first-time, save, re-use, edit, delete, clear flows.

Each step compiles and runs the test suite. The plan should split these into TDD-style steps where applicable.
