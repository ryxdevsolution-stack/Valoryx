# Team Management Feature — Design Doc

**Date:** 2026-02-27
**Status:** Approved

## Overview

Add tenant-level team management so business owners/admins can add, edit, deactivate, and manage permissions for their staff — all from the Profile page.

## Requirements

- **Placement:** Inside Profile page as a tab
- **Capabilities:** Full CRUD + granular permission management
- **Access:** Owner + Admin roles only
- **Onboarding:** Welcome email sent on user creation with login credentials

## Tab Structure (3 Tabs)

| Tab | Contents | Visible To |
|-----|----------|------------|
| **Account** | Personal info, business info, password change, Telegram setup | Everyone |
| **Team** | Team members table, Add/Edit/Deactivate users, permissions | Owner + Admin |
| **Subscription** | Plan status, Switch/Cancel, Payment history | Owner + Admin |

- URL param for deep-linking: `/profile?tab=account` (default), `?tab=team`, `?tab=subscription`
- Recent Activity sidebar remains on the right across all tabs

## Team Tab — User Table

### Table Columns

| Column | Details |
|--------|---------|
| Name | Full name + avatar initials |
| Email | Email address |
| Role | Badge (owner/admin/manager/staff/cashier) |
| Branch | Assigned branch or "All Branches" |
| Status | Green/red dot (Active/Inactive) |
| Last Login | Relative time ("2 hours ago") |
| Actions | Edit, Toggle Status, Delete buttons |

### Controls

- "Add Team Member" button (top right)
- Search bar (filter by name/email)
- Role filter dropdown
- Empty state: "Add your first team member" CTA

## Add/Edit User — Slide-over Modal

### Form Fields

- Full Name (required)
- Email (required)
- Password (required for new, optional for edit — auto-generates if blank)
- Phone (optional)
- Department (optional)
- Role (dropdown: owner, admin, manager, staff, cashier)
- Branch (dropdown: client's branches, or "All Branches")
- Active toggle

### Permissions Section

- Grouped by permission section (Dashboard, Billing, Stock, Reports, etc.)
- Checkboxes for each permission within section
- "Select All" per section
- Role templates: clicking a role pre-fills recommended permissions
- Accordion-style expansion per section

## Backend API

New `/api/team` blueprint — all endpoints require `@authenticate` + role `owner` or `admin`.
Users can only manage users within their own `client_id`.
Cannot edit/delete users with equal or higher role hierarchy.

| Method | URL | Purpose |
|--------|-----|---------|
| `GET` | `/api/team` | List team members (paginated, search, filter) |
| `POST` | `/api/team` | Create team member + send welcome email |
| `PUT` | `/api/team/<user_id>` | Update team member details |
| `DELETE` | `/api/team/<user_id>` | Soft-delete team member |
| `POST` | `/api/team/<user_id>/toggle-status` | Activate/deactivate |
| `POST` | `/api/team/<user_id>/reset-password` | Reset password + email |
| `GET` | `/api/team/<user_id>/permissions` | Get user's permissions |
| `POST` | `/api/team/<user_id>/permissions` | Bulk update permissions |

### Role Hierarchy (for protection)

```
owner > admin > manager > staff = cashier
```

An admin cannot modify or delete an owner or another admin.

### Response Format

```json
{
  "success": true,
  "data": [...],
  "total": 15,
  "page": 1,
  "per_page": 20
}
```

## File Structure

```
frontend-react/src/
  pages/
    Profile.tsx                    (refactored — tab shell, renders tab components)
  components/
    profile/
      ProfileTabs.tsx              (tab bar component)
      AccountTab.tsx               (personal + business info — extracted from Profile.tsx)
      TeamTab.tsx                  (team table + filters + empty state)
      SubscriptionTab.tsx          (plan + payments — extracted from Profile.tsx)
      TeamMemberModal.tsx          (add/edit slide-over with permissions)
  services/
    teamService.ts                 (API calls for /api/team/*)

backend/
  routes/
    team.py                        (new blueprint — /api/team/* endpoints)
```

## Security Considerations

- All team endpoints scoped to authenticated user's `client_id`
- Role hierarchy enforced server-side (cannot escalate own privileges)
- Passwords hashed with bcrypt before storage
- Welcome emails contain temporary password (user should change on first login)
- Audit logging for all team management actions
