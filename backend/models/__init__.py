# Models package — import all models here in dependency order so SQLAlchemy
# registers every mapper before any relationship string-references are resolved.
# Rule: parents before children (e.g. ClientEntry before User before UserPermission).
from extensions import db  # noqa: F401

from models.client_model import ClientEntry                              # noqa: F401
from models.subscription_model import SubscriptionPlan, PaymentTransaction  # noqa: F401
from models.user_model import User                                       # noqa: F401  ← must come before UserPermission
from models.permission_model import (                                    # noqa: F401
    PermissionSection, Permission, UserPermission,
)
from models.permission_preset_model import PermissionPreset              # noqa: F401
from models.permission_template_model import PermissionTemplate          # noqa: F401
from models.branch_model import Branch                                   # noqa: F401
from models.branch_inventory_model import BranchInventory                # noqa: F401
from models.session_model import UserSession                             # noqa: F401
from models.audit_model import AuditLog                                  # noqa: F401
from models.billing_model import GSTBilling, NonGSTBilling               # noqa: F401
from models.customer_model import Customer                               # noqa: F401
from models.stock_model import StockEntry                                # noqa: F401
from models.bulk_stock_order_model import BulkStockOrder, BulkStockOrderItem  # noqa: F401
from models.stock_transfer_model import StockTransfer, StockTransferItem # noqa: F401
from models.notes_model import Note                                      # noqa: F401
from models.report_model import Report                                   # noqa: F401
from models.expense_model import Expense, ExpenseSummary                 # noqa: F401
from models.webhook_model import WebhookEndpoint, WebhookDelivery        # noqa: F401
from models.sync_metadata_model import SyncMetadata, SyncLog             # noqa: F401
from models.supplier_model import Supplier, SupplierDelivery, SupplierDeliveryItem  # noqa: F401
from models.payment_type_model import PaymentType                          # noqa: F401
from models.bill_number_counter_model import BillNumberCounter             # noqa: F401
from models.membership_tier_model import MembershipTier                    # noqa: F401
from models.membership_card_model import MembershipCard                    # noqa: F401
from models.membership_ledger_model import MembershipLedger                # noqa: F401
