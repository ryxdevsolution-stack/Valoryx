# Granular Permission System Guide

## Overview

The MJ Billing system now includes a comprehensive granular permission system that gives administrators complete control over user access at every level. Instead of broad permissions like "view_billing", you now have fine-grained control over specific actions like "billing.view", "billing.create", "billing.edit", etc.

## Permission Structure

Permissions follow a dot notation format: `section.action`

Examples:
- `dashboard.view` - View the dashboard page
- `billing.create_bill` - Create new bills
- `customers.edit` - Edit customer information
- `stock.edit_price` - Edit product prices

## Complete Permission List

### Dashboard Permissions
| Permission | Description |
|------------|-------------|
| `dashboard.view` | View dashboard page |
| `dashboard.view_analytics` | View analytics and charts |
| `dashboard.view_revenue` | View revenue metrics |
| `dashboard.view_sales` | View sales statistics |
| `dashboard.export_data` | Export dashboard data |

### Billing Permissions

#### Billing - View
| Permission | Description |
|------------|-------------|
| `billing.view` | View bills list page |
| `billing.view_all` | View all bills |
| `billing.view_own` | View own created bills only |
| `billing.view_details` | View bill details |
| `billing.search` | Search and filter bills |

#### Billing - Create
| Permission | Description |
|------------|-------------|
| `billing.create` | Access create bill page |
| `billing.create_bill` | Create new bills |
| `billing.select_customer` | Select customers for bills |
| `billing.add_products` | Add products to bills |
| `billing.set_discount` | Apply discounts to bills |
| `billing.set_tax` | Apply tax to bills |

#### Billing - Edit
| Permission | Description |
|------------|-------------|
| `billing.edit` | Edit existing bills |
| `billing.edit_details` | Edit bill details |
| `billing.edit_products` | Edit products in bills |
| `billing.edit_amount` | Edit bill amounts |
| `billing.edit_status` | Change bill status |

#### Billing - Actions
| Permission | Description |
|------------|-------------|
| `billing.delete` | Delete bills |
| `billing.print` | Print bills |
| `billing.download_pdf` | Download bill as PDF |
| `billing.send_email` | Email bills to customers |
| `billing.duplicate` | Duplicate existing bills |
| `billing.mark_paid` | Mark bills as paid |
| `billing.mark_cancelled` | Cancel bills |

### Customer Permissions

#### Customers - View
| Permission | Description |
|------------|-------------|
| `customers.view` | View customers page |
| `customers.view_all` | View all customers |
| `customers.view_details` | View customer details |
| `customers.search` | Search and filter customers |
| `customers.view_history` | View customer purchase history |

#### Customers - Manage
| Permission | Description |
|------------|-------------|
| `customers.create` | Create new customers |
| `customers.edit` | Edit customer information |
| `customers.delete` | Delete customers |
| `customers.import` | Import customers from file |
| `customers.export` | Export customers to file |

### Stock Permissions

#### Stock - View
| Permission | Description |
|------------|-------------|
| `stock.view` | View stock page |
| `stock.view_all` | View all stock items |
| `stock.view_details` | View product details |
| `stock.search` | Search and filter stock |
| `stock.view_levels` | View stock levels |
| `stock.view_low_stock` | View low stock alerts |

#### Stock - Manage
| Permission | Description |
|------------|-------------|
| `stock.create` | Add new products |
| `stock.edit` | Edit product information |
| `stock.edit_price` | Edit product prices |
| `stock.edit_mrp` | Edit product MRP |
| `stock.edit_cost` | Edit product cost price |
| `stock.delete` | Delete products |
| `stock.adjust_quantity` | Adjust stock quantities |
| `stock.import` | Import stock from file |
| `stock.export` | Export stock to file |

### Reports Permissions

#### Reports - Access
| Permission | Description |
|------------|-------------|
| `reports.view` | View reports page |
| `reports.view_sales` | View sales reports |
| `reports.view_revenue` | View revenue reports |
| `reports.view_profit` | View profit reports |
| `reports.view_inventory` | View inventory reports |
| `reports.view_customer` | View customer reports |

#### Reports - Actions
| Permission | Description |
|------------|-------------|
| `reports.generate` | Generate new reports |
| `reports.export` | Export reports to file |
| `reports.print` | Print reports |
| `reports.schedule` | Schedule automated reports |
| `reports.custom_filters` | Use custom date filters |

### Audit Permissions
| Permission | Description |
|------------|-------------|
| `audit.view` | View audit logs page |
| `audit.view_all` | View all audit logs |
| `audit.view_own` | View own audit logs only |
| `audit.search` | Search audit logs |
| `audit.export` | Export audit logs |

### User Management Permissions

#### Users - View
| Permission | Description |
|------------|-------------|
| `users.view` | View users page |
| `users.view_all` | View all users in organization |
| `users.view_details` | View user details |

#### Users - Manage
| Permission | Description |
|------------|-------------|
| `users.create` | Create new users |
| `users.edit` | Edit user information |
| `users.delete` | Delete users |
| `users.change_role` | Change user roles |
| `users.activate` | Activate users |
| `users.deactivate` | Deactivate users |

### Permission Management
| Permission | Description |
|------------|-------------|
| `permissions.view` | View permissions page |
| `permissions.manage` | Manage user permissions |
| `permissions.grant` | Grant permissions to users |
| `permissions.revoke` | Revoke permissions from users |
| `permissions.view_all` | View all available permissions |

### Client Management (Super Admin Only)
| Permission | Description |
|------------|-------------|
| `clients.view` | View client management page |
| `clients.view_all` | View all clients |
| `clients.create` | Create new clients |
| `clients.edit` | Edit client information |
| `clients.delete` | Delete clients |
| `clients.activate` | Activate clients |
| `clients.deactivate` | Deactivate clients |

### Settings Permissions
| Permission | Description |
|------------|-------------|
| `settings.view` | View settings page |
| `settings.edit_company` | Edit company information |
| `settings.edit_billing` | Edit billing settings |
| `settings.edit_tax` | Edit tax settings |
| `settings.edit_notifications` | Edit notification settings |
| `settings.edit_theme` | Edit theme settings |

### System Permissions
| Permission | Description |
|------------|-------------|
| `system.backup` | Create system backups |
| `system.restore` | Restore from backups |
| `system.view_logs` | View system logs |
| `system.maintenance` | Access maintenance mode |

## How to Manage Permissions

### For Super Admins

1. Navigate to **User Permissions** page from the sidebar
2. Select a user from the list
3. Use the search box to quickly find specific permissions
4. Check/uncheck individual permissions or use "Select All" for entire categories
5. Click **Save Changes** to apply

### Permission Categories

Permissions are organized into logical categories with visual grouping:
- Each category shows a count of enabled permissions (e.g., "5/12")
- Use the "Select All" checkbox to quickly enable/disable all permissions in a category
- The checkbox shows an indeterminate state when some (but not all) permissions are selected

### Search Functionality

The permission search allows you to filter by:
- Permission name (e.g., "billing.create")
- Permission description (e.g., "Create new bills")
- Category name (e.g., "Billing - Create")

## Migration Instructions

To add these granular permissions to your database:

```bash
cd backend
python3 migrations/add_permissions_system.py
```

This will:
- Add all granular permissions to the database
- Update existing permissions if they already exist
- Preserve any user permissions already granted

## Best Practices

1. **Principle of Least Privilege**: Only grant permissions users actually need
2. **Role-Based Groups**: Create common permission sets for different roles (e.g., Sales, Manager, Accountant)
3. **Regular Audits**: Review user permissions periodically
4. **Super Admin**: Reserve super admin status for trusted administrators only
5. **Testing**: Test permission changes in a non-production environment first

## Common Permission Sets

### Sales Representative
- `dashboard.view`, `dashboard.view_sales`
- `billing.view`, `billing.create`, `billing.create_bill`
- `customers.view`, `customers.view_all`, `customers.create`
- `stock.view`, `stock.view_all`

### Inventory Manager
- `dashboard.view`
- `stock.*` (all stock permissions)
- `reports.view`, `reports.view_inventory`

### Accountant
- `dashboard.view`, `dashboard.view_revenue`
- `billing.view_all`, `billing.edit`, `billing.mark_paid`
- `reports.view`, `reports.view_revenue`, `reports.view_profit`, `reports.export`
- `audit.view`, `audit.view_all`

### Manager (Full Access)
- All permissions except `clients.*` and `system.*`

## Security Notes

- **Super Admins**: Bypass all permission checks and have full access
- **Session-Based**: Permissions are checked on each request
- **Audit Logging**: All permission changes are logged
- **Database Backed**: Permissions stored securely in PostgreSQL

## Troubleshooting

**User can't see a page:**
- Check if they have the required `.view` permission for that section
- Verify they're not deactivated
- Check if permission exists in database

**Permission changes not taking effect:**
- User may need to log out and log back in
- Check browser console for errors
- Verify migration was run successfully

**Too many permissions to manage:**
- Use the search feature to find specific permissions
- Use "Select All" for category-wide changes
- Consider creating permission templates/roles

## Support

For issues or questions about the permission system, check:
1. The User Permissions page for current assignments
2. Audit logs for permission change history
3. System logs for technical errors
