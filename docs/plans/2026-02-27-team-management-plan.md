# Team Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add tenant-level team management to the Profile page so business owners/admins can add, edit, deactivate, and manage permissions for their staff.

**Architecture:** Refactor the Profile page into a 3-tab layout (Account, Team, Subscription). The Team tab provides full CRUD for users within the same `client_id`, with a slide-over modal for add/edit that includes granular permission management. A new `/api/team` Flask blueprint handles all backend operations, reusing existing permission models and email service.

**Tech Stack:** React 18 + TypeScript + Tailwind (frontend), Flask + SQLAlchemy + bcrypt (backend), existing permission system (`PermissionSection`, `Permission`, `UserPermission`), existing email service (`send_welcome_email` pattern).

---

## Task 1: Backend — Create Team Blueprint with List Endpoint

**Files:**
- Create: `backend/routes/team.py`
- Modify: `backend/app.py` (register blueprint)

**Step 1: Create the team blueprint with role hierarchy helper and list endpoint**

Create `backend/routes/team.py`:

```python
from flask import Blueprint, jsonify, request, g
from extensions import db
from models.user_model import User
from models.client_model import ClientEntry
from models.branch_model import Branch
from models.permission_model import (
    Permission, UserPermission, PermissionSection,
    get_user_permissions, bulk_update_permissions,
    get_all_sections_with_permissions, get_user_permissions_by_section
)
from models.audit_model import AuditLog
from utils.auth_middleware import authenticate, require_role
from utils.email_service import send_welcome_email
import bcrypt
import uuid
from datetime import datetime
from sqlalchemy import or_

team_bp = Blueprint('team', __name__)

# Role hierarchy — higher index = higher rank
ROLE_HIERARCHY = {'cashier': 0, 'staff': 0, 'manager': 1, 'admin': 2, 'owner': 3}

def _can_manage(actor_role: str, target_role: str) -> bool:
    """Return True if actor's role outranks target's role."""
    return ROLE_HIERARCHY.get(actor_role, 0) > ROLE_HIERARCHY.get(target_role, 0)

def _log_team_action(action_type, record_id=None, old_data=None, new_data=None):
    try:
        audit_log = AuditLog(
            log_id=str(uuid.uuid4()),
            user_id=g.user['user_id'],
            client_id=g.user['client_id'],
            action_type=action_type,
            table_name='users',
            record_id=record_id,
            old_data=old_data,
            new_data=new_data,
            ip_address=request.remote_addr,
            user_agent=request.headers.get('User-Agent', '')
        )
        db.session.add(audit_log)
        db.session.commit()
    except Exception as e:
        print(f"Error logging team action: {e}")


@team_bp.route('', methods=['GET'])
@authenticate
@require_role(['owner', 'admin'])
def list_team_members():
    """List all team members for the current client."""
    try:
        client_id = g.user['client_id']
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 20))
        search = request.args.get('search', '').strip()
        role_filter = request.args.get('role', '')

        query = User.query.filter(
            User.client_id == client_id,
            User.deleted_at.is_(None)
        )

        if search:
            query = query.filter(or_(
                User.full_name.ilike(f'%{search}%'),
                User.email.ilike(f'%{search}%')
            ))

        if role_filter:
            query = query.filter(User.role == role_filter)

        total = query.count()
        offset = (page - 1) * limit
        users = query.order_by(User.created_at.desc()).offset(offset).limit(limit).all()

        # Batch fetch branches
        branch_ids = [u.branch_id for u in users if u.branch_id]
        branches = Branch.query.filter(Branch.branch_id.in_(branch_ids)).all() if branch_ids else []
        branch_map = {str(b.branch_id): b.name for b in branches}

        users_data = [{
            'user_id': str(u.user_id),
            'email': u.email,
            'full_name': u.full_name or '',
            'phone': u.phone or '',
            'department': u.department or '',
            'role': u.role,
            'is_active': u.is_active,
            'branch_id': str(u.branch_id) if u.branch_id else None,
            'branch_name': branch_map.get(str(u.branch_id)) if u.branch_id else None,
            'last_login': u.last_login.isoformat() if u.last_login else None,
            'created_at': u.created_at.isoformat() if u.created_at else None,
        } for u in users]

        return jsonify({
            'success': True,
            'data': users_data,
            'total': total,
            'page': page,
            'per_page': limit
        }), 200

    except Exception as e:
        return jsonify({'success': False, 'error': f'Failed to fetch team: {str(e)}'}), 500
```

**Step 2: Register the blueprint in app.py**

In `backend/app.py`, find the blueprint registration section and add after the last `register_blueprint` call:

```python
try:
    from routes.team import team_bp
    app.register_blueprint(team_bp, url_prefix='/api/team')
except Exception as e:
    import_errors.append(f"team: {str(e)}")
```

**Step 3: Verify the server starts without errors**

Run: `cd backend && python app.py` — check no import errors in console.

**Step 4: Commit**

```bash
git add backend/routes/team.py backend/app.py
git commit -m "feat(team): add team blueprint with list endpoint"
```

---

## Task 2: Backend — Create, Update, Delete Team Members

**Files:**
- Modify: `backend/routes/team.py`

**Step 1: Add the create endpoint**

Append to `backend/routes/team.py`:

```python
@team_bp.route('', methods=['POST'])
@authenticate
@require_role(['owner', 'admin'])
def create_team_member():
    """Create a new team member under the current client."""
    try:
        data = request.get_json()
        client_id = g.user['client_id']
        actor_role = g.user['role']

        email = (data.get('email') or '').strip().lower()
        password = data.get('password', '')
        full_name = (data.get('full_name') or '').strip()
        role = data.get('role', 'staff')

        if not email or not password:
            return jsonify({'success': False, 'error': 'Email and password are required'}), 400

        # Cannot create user with equal or higher role
        if not _can_manage(actor_role, role):
            return jsonify({'success': False, 'error': f'You cannot create a user with role "{role}"'}), 403

        # Check duplicate email globally
        if User.query.filter_by(email=email).first():
            return jsonify({'success': False, 'error': 'A user with this email already exists'}), 409

        password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

        new_user = User(
            user_id=str(uuid.uuid4()),
            email=email,
            password_hash=password_hash,
            full_name=full_name,
            phone=data.get('phone', ''),
            department=data.get('department', ''),
            role=role,
            client_id=client_id,
            is_active=data.get('is_active', True),
            branch_id=data.get('branch_id') or None,
            created_by=g.user['user_id'],
            created_at=datetime.utcnow()
        )

        db.session.add(new_user)
        db.session.flush()

        # Assign permissions if provided
        permissions = data.get('permissions', [])
        if permissions:
            for perm_name in permissions:
                perm = Permission.query.filter_by(permission_name=perm_name).first()
                if perm:
                    db.session.add(UserPermission(
                        id=str(uuid.uuid4()),
                        user_id=new_user.user_id,
                        permission_id=perm.permission_id,
                        granted_by=g.user['user_id']
                    ))

        db.session.commit()

        _log_team_action('CREATE', record_id=str(new_user.user_id),
                         new_data={'email': email, 'role': role})

        # Send welcome email
        try:
            client = ClientEntry.query.filter_by(client_id=client_id).first()
            from utils.email_service import _send_async, _base_layout, _info_table, _info_row
            subject = f"You've been invited to {client.client_name} on VALORYX"
            body = f"""
                <h2 style="margin:0 0 6px 0;font-size:22px;font-weight:700;color:#111111;">Welcome to {client.client_name}!</h2>
                <p style="margin:0 0 20px 0;color:#555555;">You've been added as a team member. Here are your login credentials:</p>
                {_info_table(
                    _info_row('Email', email, first=True) +
                    _info_row('Password', password) +
                    _info_row('Role', role.title())
                )}
                <p>Please log in and change your password as soon as possible.</p>
            """
            _send_async(email, subject, _base_layout(
                preheader=f"You've been invited to {client.client_name}",
                body_html=body
            ))
        except Exception as email_err:
            print(f"Welcome email failed: {email_err}")

        return jsonify({
            'success': True,
            'message': 'Team member created successfully',
            'user_id': str(new_user.user_id)
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': f'Failed to create team member: {str(e)}'}), 500
```

**Step 2: Add the update endpoint**

```python
@team_bp.route('/<user_id>', methods=['PUT'])
@authenticate
@require_role(['owner', 'admin'])
def update_team_member(user_id):
    """Update a team member's details."""
    try:
        client_id = g.user['client_id']
        actor_role = g.user['role']

        user = User.query.filter_by(user_id=user_id, client_id=client_id, deleted_at=None).first()
        if not user:
            return jsonify({'success': False, 'error': 'Team member not found'}), 404

        # Cannot edit user with equal or higher role (except self)
        if str(user.user_id) != g.user['user_id'] and not _can_manage(actor_role, user.role):
            return jsonify({'success': False, 'error': 'You cannot edit this user'}), 403

        data = request.get_json()
        changes = {}

        # If changing role, check hierarchy for new role too
        new_role = data.get('role')
        if new_role and new_role != user.role:
            if not _can_manage(actor_role, new_role):
                return jsonify({'success': False, 'error': f'You cannot assign role "{new_role}"'}), 403
            changes['role'] = {'old': user.role, 'new': new_role}
            user.role = new_role

        if 'email' in data and data['email'] != user.email:
            existing = User.query.filter_by(email=data['email']).first()
            if existing and str(existing.user_id) != user_id:
                return jsonify({'success': False, 'error': 'Email already in use'}), 409
            changes['email'] = {'old': user.email, 'new': data['email']}
            user.email = data['email']

        for field in ['full_name', 'phone', 'department']:
            if field in data:
                changes[field] = {'old': getattr(user, field), 'new': data[field]}
                setattr(user, field, data[field])

        if 'is_active' in data:
            changes['is_active'] = {'old': user.is_active, 'new': data['is_active']}
            user.is_active = data['is_active']

        if 'branch_id' in data:
            new_branch = data['branch_id'] or None
            changes['branch_id'] = {'old': str(user.branch_id) if user.branch_id else None, 'new': new_branch}
            user.branch_id = new_branch

        user.updated_at = datetime.utcnow()
        user.updated_by = g.user['user_id']
        db.session.commit()

        _log_team_action('UPDATE', record_id=user_id, new_data=changes)

        return jsonify({'success': True, 'message': 'Team member updated successfully'}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': f'Failed to update team member: {str(e)}'}), 500
```

**Step 3: Add delete, toggle-status, and reset-password endpoints**

```python
@team_bp.route('/<user_id>', methods=['DELETE'])
@authenticate
@require_role(['owner', 'admin'])
def delete_team_member(user_id):
    """Soft-delete a team member."""
    try:
        client_id = g.user['client_id']
        actor_role = g.user['role']

        if g.user['user_id'] == user_id:
            return jsonify({'success': False, 'error': 'Cannot delete yourself'}), 400

        user = User.query.filter_by(user_id=user_id, client_id=client_id, deleted_at=None).first()
        if not user:
            return jsonify({'success': False, 'error': 'Team member not found'}), 404

        if not _can_manage(actor_role, user.role):
            return jsonify({'success': False, 'error': 'You cannot delete this user'}), 403

        user.is_active = False
        user.deleted_at = datetime.utcnow()
        user.updated_by = g.user['user_id']
        db.session.commit()

        _log_team_action('DELETE', record_id=user_id, old_data={'email': user.email, 'role': user.role})

        return jsonify({'success': True, 'message': 'Team member removed'}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': f'Failed to delete team member: {str(e)}'}), 500


@team_bp.route('/<user_id>/toggle-status', methods=['POST'])
@authenticate
@require_role(['owner', 'admin'])
def toggle_team_member_status(user_id):
    """Activate or deactivate a team member."""
    try:
        client_id = g.user['client_id']
        actor_role = g.user['role']

        user = User.query.filter_by(user_id=user_id, client_id=client_id, deleted_at=None).first()
        if not user:
            return jsonify({'success': False, 'error': 'Team member not found'}), 404

        if not _can_manage(actor_role, user.role):
            return jsonify({'success': False, 'error': 'You cannot change this user\'s status'}), 403

        user.is_active = not user.is_active
        user.updated_at = datetime.utcnow()
        user.updated_by = g.user['user_id']
        db.session.commit()

        status = 'activated' if user.is_active else 'deactivated'
        _log_team_action('UPDATE', record_id=user_id, new_data={'is_active': user.is_active})

        return jsonify({'success': True, 'message': f'Team member {status}', 'is_active': user.is_active}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


@team_bp.route('/<user_id>/reset-password', methods=['POST'])
@authenticate
@require_role(['owner', 'admin'])
def reset_team_member_password(user_id):
    """Reset a team member's password (auto-generate or accept new password)."""
    try:
        client_id = g.user['client_id']
        actor_role = g.user['role']

        user = User.query.filter_by(user_id=user_id, client_id=client_id, deleted_at=None).first()
        if not user:
            return jsonify({'success': False, 'error': 'Team member not found'}), 404

        if not _can_manage(actor_role, user.role):
            return jsonify({'success': False, 'error': 'You cannot reset this user\'s password'}), 403

        data = request.get_json() or {}
        new_password = data.get('password') or str(uuid.uuid4())[:12]

        user.password_hash = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        user.updated_at = datetime.utcnow()
        user.updated_by = g.user['user_id']
        db.session.commit()

        _log_team_action('UPDATE', record_id=user_id, new_data={'action': 'password_reset'})

        return jsonify({
            'success': True,
            'message': 'Password has been reset',
            'temporary_password': new_password
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500
```

**Step 4: Commit**

```bash
git add backend/routes/team.py
git commit -m "feat(team): add create, update, delete, toggle-status, reset-password endpoints"
```

---

## Task 3: Backend — Permission Management Endpoints for Team

**Files:**
- Modify: `backend/routes/team.py`

**Step 1: Add get-permissions and update-permissions endpoints**

Append to `backend/routes/team.py`:

```python
@team_bp.route('/<user_id>/permissions', methods=['GET'])
@authenticate
@require_role(['owner', 'admin'])
def get_team_member_permissions(user_id):
    """Get a team member's permissions organized by section."""
    try:
        client_id = g.user['client_id']
        user = User.query.filter_by(user_id=user_id, client_id=client_id, deleted_at=None).first()
        if not user:
            return jsonify({'success': False, 'error': 'Team member not found'}), 404

        sections = get_user_permissions_by_section(user_id)
        return jsonify({'success': True, 'data': sections}), 200

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@team_bp.route('/<user_id>/permissions', methods=['POST'])
@authenticate
@require_role(['owner', 'admin'])
def update_team_member_permissions(user_id):
    """Bulk-update a team member's permissions."""
    try:
        client_id = g.user['client_id']
        actor_role = g.user['role']

        user = User.query.filter_by(user_id=user_id, client_id=client_id, deleted_at=None).first()
        if not user:
            return jsonify({'success': False, 'error': 'Team member not found'}), 404

        if not _can_manage(actor_role, user.role):
            return jsonify({'success': False, 'error': 'You cannot manage this user\'s permissions'}), 403

        data = request.get_json()
        permissions = data.get('permissions', [])

        result = bulk_update_permissions(user_id, permissions, g.user['user_id'])

        _log_team_action('UPDATE', record_id=user_id,
                         new_data={'permissions_added': result['added'], 'permissions_removed': result['removed']})

        return jsonify({'success': True, 'message': 'Permissions updated', 'changes': result}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


@team_bp.route('/permissions/all', methods=['GET'])
@authenticate
@require_role(['owner', 'admin'])
def get_all_permissions():
    """Get all available permissions organized by section (for the permission editor UI)."""
    try:
        sections = get_all_sections_with_permissions()
        return jsonify({'success': True, 'data': sections}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@team_bp.route('/branches', methods=['GET'])
@authenticate
@require_role(['owner', 'admin'])
def get_client_branches():
    """Get all branches for the current client (for branch dropdown in forms)."""
    try:
        branches = Branch.query.filter_by(client_id=g.user['client_id'], is_active=True).all()
        return jsonify({
            'success': True,
            'data': [b.to_dict() for b in branches]
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
```

**Step 2: Commit**

```bash
git add backend/routes/team.py
git commit -m "feat(team): add permission management and branches endpoints"
```

---

## Task 4: Frontend — Team Service Layer

**Files:**
- Create: `frontend-react/src/services/teamService.ts`

**Step 1: Create the team API service**

```typescript
import api from '@/lib/api'

export interface TeamMember {
  user_id: string
  email: string
  full_name: string
  phone: string
  department: string
  role: string
  is_active: boolean
  branch_id: string | null
  branch_name: string | null
  last_login: string | null
  created_at: string | null
}

export interface TeamListResponse {
  success: boolean
  data: TeamMember[]
  total: number
  page: number
  per_page: number
}

export interface PermissionItem {
  permission_id: string
  permission_name: string
  description: string
  has_permission?: boolean
}

export interface PermissionSection {
  section_id: string
  section_name: string
  description: string
  display_order: number
  icon: string | null
  permissions: PermissionItem[]
}

export interface BranchItem {
  branch_id: string
  name: string
  location: string | null
}

export interface CreateTeamMemberPayload {
  email: string
  password: string
  full_name: string
  phone?: string
  department?: string
  role: string
  is_active?: boolean
  branch_id?: string | null
  permissions?: string[]
}

export interface UpdateTeamMemberPayload {
  email?: string
  full_name?: string
  phone?: string
  department?: string
  role?: string
  is_active?: boolean
  branch_id?: string | null
}

const teamService = {
  list: (params?: { page?: number; limit?: number; search?: string; role?: string }) =>
    api.get<TeamListResponse>('/team', { params }),

  create: (data: CreateTeamMemberPayload) =>
    api.post('/team', data),

  update: (userId: string, data: UpdateTeamMemberPayload) =>
    api.put(`/team/${userId}`, data),

  delete: (userId: string) =>
    api.delete(`/team/${userId}`),

  toggleStatus: (userId: string) =>
    api.post(`/team/${userId}/toggle-status`),

  resetPassword: (userId: string, password?: string) =>
    api.post(`/team/${userId}/reset-password`, password ? { password } : {}),

  getPermissions: (userId: string) =>
    api.get<{ success: boolean; data: PermissionSection[] }>(`/team/${userId}/permissions`),

  updatePermissions: (userId: string, permissions: string[]) =>
    api.post(`/team/${userId}/permissions`, { permissions }),

  getAllPermissions: () =>
    api.get<{ success: boolean; data: PermissionSection[] }>('/team/permissions/all'),

  getBranches: () =>
    api.get<{ success: boolean; data: BranchItem[] }>('/team/branches'),
}

export default teamService
```

**Step 2: Commit**

```bash
git add frontend-react/src/services/teamService.ts
git commit -m "feat(team): add frontend team API service layer"
```

---

## Task 5: Frontend — Refactor Profile.tsx into Tabbed Layout

**Files:**
- Modify: `frontend-react/src/pages/Profile.tsx`
- Create: `frontend-react/src/components/profile/ProfileTabs.tsx`
- Create: `frontend-react/src/components/profile/AccountTab.tsx`
- Create: `frontend-react/src/components/profile/SubscriptionTab.tsx`

This is the largest task. The goal is to:
1. Extract the Account content (profile info + business info + password + telegram) into `AccountTab.tsx`
2. Extract the Subscription content (plan status + payment history) into `SubscriptionTab.tsx`
3. Create a `ProfileTabs.tsx` tab bar component
4. Refactor `Profile.tsx` to be a thin shell: header + tab bar + active tab content + recent activity sidebar

**Step 1: Create ProfileTabs.tsx**

```typescript
import { Users, CreditCard, User } from 'lucide-react'

export type ProfileTab = 'account' | 'team' | 'subscription'

interface ProfileTabsProps {
  activeTab: ProfileTab
  onTabChange: (tab: ProfileTab) => void
  showTeamTab: boolean
  showSubscriptionTab: boolean
}

const TABS: { id: ProfileTab; label: string; icon: typeof User }[] = [
  { id: 'account', label: 'Account', icon: User },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'subscription', label: 'Subscription', icon: CreditCard },
]

export default function ProfileTabs({ activeTab, onTabChange, showTeamTab, showSubscriptionTab }: ProfileTabsProps) {
  const visibleTabs = TABS.filter(tab => {
    if (tab.id === 'team') return showTeamTab
    if (tab.id === 'subscription') return showSubscriptionTab
    return true
  })

  return (
    <div className="flex gap-1 px-4 pb-2 flex-shrink-0">
      {visibleTabs.map(tab => {
        const Icon = tab.icon
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              isActive
                ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
```

**Step 2: Create AccountTab.tsx**

Extract lines ~384–1009 from Profile.tsx (the Profile Card, Business Info, Password Change, and Telegram sections) into this component. It receives all the state and handlers as props.

The component signature:

```typescript
interface AccountTabProps {
  profile: ProfileData
  user: any // from useClient
  client: any
  // Edit state
  isEditing: boolean
  setIsEditing: (v: boolean) => void
  editForm: { full_name: string; phone: string; department: string }
  setEditForm: (v: any) => void
  saving: boolean
  handleSaveProfile: () => void
  // Business edit state
  isEditingBusiness: boolean
  setIsEditingBusiness: (v: boolean) => void
  businessForm: { client_name: string; phone: string; address: string; gstin: string }
  setBusinessForm: (v: any) => void
  savingBusiness: boolean
  handleSaveBusiness: () => void
  // Password state
  showPasswordForm: boolean
  setShowPasswordForm: (v: boolean) => void
  passwordForm: { current_password: string; new_password: string; confirm_password: string }
  setPasswordForm: (v: any) => void
  changingPassword: boolean
  handlePasswordChange: () => void
  // Telegram state
  telegramChatId: string
  setTelegramChatId: (v: string) => void
  savingTelegram: boolean
  handleSaveTelegramChatId: () => void
  testingTelegram: boolean
  handleSendTestReport: () => void
}
```

Move the JSX for Profile Card, Business Info card, Password Change card, and Telegram card from Profile.tsx into this component. No logic changes — just extraction.

**Step 3: Create SubscriptionTab.tsx**

Extract the Subscription & Payments section from Profile.tsx (~lines within the left column that handle subscription status, switch plan, cancel subscription, and payment history).

```typescript
interface SubscriptionTabProps {
  client: any
  transactions: Transaction[]
  loadingPayments: boolean
  showCancelConfirm: boolean
  setShowCancelConfirm: (v: boolean) => void
  cancelReason: string
  setCancelReason: (v: string) => void
  cancelReasonOther: string
  setCancelReasonOther: (v: string) => void
  cancelling: boolean
  handleCancelSubscription: () => void
  formatPrice: (paise: number) => string
  formatDate: (d: string | null) => string
  getUpgradeUrl: () => string
}
```

**Step 4: Refactor Profile.tsx to be a tab shell**

Profile.tsx becomes ~150 lines: imports, state, handlers, and a return that renders:
1. Header ("My Profile")
2. Message alert
3. `<ProfileTabs>` component
4. Two-column layout:
   - Left: `{activeTab === 'account' && <AccountTab .../>}` / `{activeTab === 'team' && <TeamTab />}` / `{activeTab === 'subscription' && <SubscriptionTab .../>}`
   - Right: Recent Activity sidebar (stays in Profile.tsx)
5. Tab from URL: `const [activeTab, setActiveTab] = useState<ProfileTab>(() => { const params = new URLSearchParams(window.location.search); return (params.get('tab') as ProfileTab) || 'account' })`
6. Update URL on tab change: `const handleTabChange = (tab: ProfileTab) => { setActiveTab(tab); const url = new URL(window.location.href); url.searchParams.set('tab', tab); window.history.replaceState({}, '', url.toString()) }`
7. Team and Subscription tabs visible only for owner/admin: `const canManageTeam = user?.role === 'owner' || user?.role === 'admin'`

**Step 5: Commit**

```bash
git add frontend-react/src/components/profile/ frontend-react/src/pages/Profile.tsx
git commit -m "refactor(profile): extract into tabbed layout with Account and Subscription tabs"
```

---

## Task 6: Frontend — TeamTab Component (User Table)

**Files:**
- Create: `frontend-react/src/components/profile/TeamTab.tsx`

**Step 1: Create the TeamTab component**

This component handles:
- Fetching team members via `teamService.list()`
- Search input + role filter dropdown
- Table with columns: Name, Email, Role (badge), Branch, Status (dot), Last Login, Actions
- "Add Team Member" button that opens the modal
- Loading and empty states
- Pagination

Key implementation details:
- Use `useState` + `useEffect` for data fetching (not React Query since the project doesn't use it)
- Role badges with color coding: owner=purple, admin=blue, manager=green, staff=gray, cashier=amber
- Status dot: green for active, red for inactive
- Last login: use relative time ("2h ago", "3 days ago") — write a small `timeAgo()` helper
- Actions column: Edit (pencil icon), Toggle Status (power icon), Delete (trash icon) — only show for users the current user can manage (role hierarchy)
- Empty state: centered icon + "No team members yet" + "Add your first team member" button

```typescript
interface TeamTabProps {
  onMessage: (msg: { type: 'success' | 'error'; text: string }) => void
}
```

The component manages its own state for the team list, search, filters, pagination, and modal open/close.

**Step 2: Wire TeamTab into Profile.tsx**

In Profile.tsx, import and render:
```typescript
{activeTab === 'team' && <TeamTab onMessage={setMessage} />}
```

**Step 3: Verify the tab renders with empty state (no team members besides self)**

**Step 4: Commit**

```bash
git add frontend-react/src/components/profile/TeamTab.tsx frontend-react/src/pages/Profile.tsx
git commit -m "feat(team): add TeamTab component with user table and filters"
```

---

## Task 7: Frontend — TeamMemberModal (Add/Edit with Permissions)

**Files:**
- Create: `frontend-react/src/components/profile/TeamMemberModal.tsx`

**Step 1: Create the slide-over modal component**

This is the most complex frontend component. It handles:

**Form layout (slide-over from right):**
- Overlay backdrop with click-to-close
- Panel slides in from right (w-full max-w-lg)
- Header: "Add Team Member" or "Edit Team Member" with close button
- Scrollable form body
- Fixed footer with Cancel + Save buttons

**Form fields:**
- Full Name (text input, required)
- Email (email input, required)
- Password (text input, required for create, optional "Generate" button for edit)
- Phone (text input)
- Department (text input)
- Role (select dropdown: owner, admin, manager, staff, cashier — filtered by hierarchy)
- Branch (select dropdown: "All Branches" + fetched branches)
- Active toggle (switch)

**Permissions section:**
- Fetches all permissions from `teamService.getAllPermissions()`
- If editing, also fetches user's current permissions from `teamService.getPermissions(userId)`
- Renders sections as accordions (click to expand)
- Each section shows checkboxes for its permissions
- "Select All" checkbox per section
- When role changes, offer to load role template permissions (optional)

**Props:**
```typescript
interface TeamMemberModalProps {
  isOpen: boolean
  onClose: () => void
  onSaved: () => void  // callback to refresh the table
  editingUser: TeamMember | null  // null = create mode
  onMessage: (msg: { type: 'success' | 'error'; text: string }) => void
}
```

**Behavior:**
- Create mode: POST to teamService.create with all fields + permissions, then call onSaved
- Edit mode: PUT to teamService.update for profile fields, then POST to teamService.updatePermissions for permissions, then call onSaved
- Loading states on save button
- Form validation: email format, password min 6 chars (create), required fields

**Step 2: Wire modal into TeamTab**

TeamTab manages `showModal` and `editingUser` state. "Add Team Member" button sets `showModal=true, editingUser=null`. Row edit button sets `showModal=true, editingUser=member`.

**Step 3: Test create and edit flows end to end**

**Step 4: Commit**

```bash
git add frontend-react/src/components/profile/TeamMemberModal.tsx frontend-react/src/components/profile/TeamTab.tsx
git commit -m "feat(team): add TeamMemberModal with permission management"
```

---

## Task 8: Integration Testing & Polish

**Files:**
- Modify: various (bug fixes found during testing)

**Step 1: Test the full flow**
1. Log in as owner/admin
2. Go to Profile → Team tab
3. Add a new team member (check welcome email is sent)
4. Edit the team member (change role, update permissions)
5. Toggle status (deactivate/reactivate)
6. Reset password
7. Delete team member
8. Verify non-admin users do NOT see the Team tab
9. Verify role hierarchy works (admin can't edit owner)

**Step 2: Test edge cases**
- Duplicate email error
- Creating user with same/higher role
- Self-deletion prevention
- Empty search results
- Pagination with many users

**Step 3: Fix any issues found**

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(team): complete team management with integration polish"
```

---

## Summary

| Task | Component | Files |
|------|-----------|-------|
| 1 | Backend list endpoint | `team.py`, `app.py` |
| 2 | Backend CRUD endpoints | `team.py` |
| 3 | Backend permissions endpoints | `team.py` |
| 4 | Frontend service layer | `teamService.ts` |
| 5 | Profile tab refactor | `Profile.tsx`, `ProfileTabs.tsx`, `AccountTab.tsx`, `SubscriptionTab.tsx` |
| 6 | Team tab (table) | `TeamTab.tsx` |
| 7 | Add/Edit modal | `TeamMemberModal.tsx` |
| 8 | Integration testing | Various |

**Dependency chain:** Tasks 1-3 (backend, sequential) → Task 4 (service) → Task 5 (refactor) → Task 6 (table) → Task 7 (modal) → Task 8 (polish)

**Parallel opportunity:** Tasks 1-3 (backend) can run in parallel with Task 5 (frontend refactor) since they don't depend on each other until Task 6.
