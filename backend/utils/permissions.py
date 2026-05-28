"""Central permission constants.

SUPER_ADMIN_ONLY_PERMISSIONS — the small set of permission_names that are
seeded in the permissions table but are only meaningful for users with
is_super_admin=True. The corresponding backend routes use @require_super_admin
(role-gated), so granting these perms to a regular user is harmless today —
but it pollutes the user's perm list, confuses the EditUser UI, and would
become a real leak the moment any route forgets its role gate.

Treat this set as the single source of truth. Strip from:
  - team.py _ALL_PERMISSIONS (owner role default)
  - admin.py full_access template
  - All write paths that accept a permissions[] from the client when the
    target user has is_super_admin=False
  - Frontend display lists when the target user is not super_admin

Add to this set only when:
  - A new permission gates a route that uses @require_super_admin
  - That permission is NOT useful to a regular owner/admin
"""

SUPER_ADMIN_ONLY_PERMISSIONS: frozenset[str] = frozenset({
    'manage_clients',       # Manage other tenant organizations
    'system_backup',        # Create system backups
    'system_restore',       # Restore from backups
    'maintenance_mode',     # Enable maintenance mode
})
