"""
RYX Billing - Dynamic Blueprint Loader
Eliminates duplicated blueprint import/registration code
"""
import logging
from importlib import import_module
from typing import List, Dict, Tuple, Optional
from flask import Flask

logger = logging.getLogger(__name__)


# ============================================================================
# BLUEPRINT CONFIGURATION
# ============================================================================

# Define all blueprints with their module paths and URL prefixes
BLUEPRINT_CONFIG: List[Dict] = [
    {"name": "auth", "module": "routes.auth", "blueprint": "auth_bp", "prefix": "/api/auth"},
    {"name": "billing", "module": "routes.billing", "blueprint": "billing_bp", "prefix": "/api/billing"},
    {"name": "stock", "module": "routes.stock", "blueprint": "stock_bp", "prefix": "/api/stock"},
    {"name": "report", "module": "routes.report", "blueprint": "report_bp", "prefix": "/api/report"},
    {"name": "audit", "module": "routes.audit", "blueprint": "audit_bp", "prefix": "/api/audit"},
    {"name": "client", "module": "routes.client", "blueprint": "client_bp", "prefix": "/api/clients"},
    {"name": "payment", "module": "routes.payment", "blueprint": "payment_bp", "prefix": "/api/payment"},
    {"name": "customer", "module": "routes.customer", "blueprint": "customer_bp", "prefix": "/api/customer"},
    {"name": "analytics", "module": "routes.analytics", "blueprint": "analytics_bp", "prefix": "/api/analytics"},
    {"name": "permissions", "module": "routes.permissions", "blueprint": "permissions_bp", "prefix": "/api/permissions"},
    {"name": "admin", "module": "routes.admin", "blueprint": "admin_bp", "prefix": "/api/admin"},
    {"name": "notes", "module": "routes.notes", "blueprint": "notes_bp", "prefix": "/api"},
    {"name": "bulk_orders", "module": "routes.bulk_stock_order", "blueprint": "bulk_order_bp", "prefix": "/api/bulk-orders"},
    {"name": "expense", "module": "routes.expense", "blueprint": "expense_bp", "prefix": "/api/expense"},
    {"name": "profile", "module": "routes.profile", "blueprint": "profile_bp", "prefix": "/api/profile"},
]


# ============================================================================
# BLUEPRINT LOADER
# ============================================================================

class BlueprintLoader:
    """
    Handles dynamic loading and registration of Flask blueprints.
    Provides detailed error reporting and graceful degradation.
    """

    def __init__(self, app: Flask):
        self.app = app
        self.registered: List[str] = []
        self.import_errors: List[Dict] = []
        self.registration_errors: List[Dict] = []

    def load_all(self, config: List[Dict] = None) -> Tuple[List[str], List[Dict]]:
        """
        Load and register all blueprints from configuration.

        Args:
            config: Optional list of blueprint configurations.
                   Defaults to BLUEPRINT_CONFIG if not provided.

        Returns:
            Tuple of (registered_blueprints, errors)
        """
        config = config or BLUEPRINT_CONFIG

        for bp_config in config:
            self._load_blueprint(bp_config)

        # Log summary
        self._log_summary()

        return self.registered, self.import_errors + self.registration_errors

    def _load_blueprint(self, bp_config: Dict) -> bool:
        """
        Import and register a single blueprint.

        Args:
            bp_config: Blueprint configuration dict with keys:
                - name: Human-readable name
                - module: Module path (e.g., "routes.auth")
                - blueprint: Blueprint variable name in module
                - prefix: URL prefix for blueprint

        Returns:
            True if successful, False otherwise
        """
        name = bp_config["name"]
        module_path = bp_config["module"]
        blueprint_var = bp_config["blueprint"]
        url_prefix = bp_config["prefix"]

        # Step 1: Import the module
        blueprint = self._import_blueprint(name, module_path, blueprint_var)
        if blueprint is None:
            return False

        # Step 2: Register the blueprint
        return self._register_blueprint(name, blueprint, url_prefix)

    def _import_blueprint(self, name: str, module_path: str, blueprint_var: str) -> Optional[object]:
        """Import a blueprint from a module"""
        try:
            module = import_module(module_path)
            blueprint = getattr(module, blueprint_var)
            logger.debug(f"Successfully imported blueprint: {name}")
            return blueprint

        except ImportError as e:
            error = {
                "name": name,
                "type": "import",
                "error": str(e),
                "module": module_path
            }
            self.import_errors.append(error)
            logger.error(f"Failed to import blueprint '{name}' from {module_path}: {e}")
            return None

        except AttributeError as e:
            error = {
                "name": name,
                "type": "attribute",
                "error": f"Blueprint variable '{blueprint_var}' not found in {module_path}",
                "module": module_path
            }
            self.import_errors.append(error)
            logger.error(f"Blueprint '{name}': {error['error']}")
            return None

        except Exception as e:
            error = {
                "name": name,
                "type": "unknown",
                "error": str(e),
                "module": module_path
            }
            self.import_errors.append(error)
            logger.error(f"Unexpected error importing blueprint '{name}': {e}")
            return None

    def _register_blueprint(self, name: str, blueprint: object, url_prefix: str) -> bool:
        """Register a blueprint with the Flask app"""
        try:
            self.app.register_blueprint(blueprint, url_prefix=url_prefix)
            self.registered.append(name)
            logger.debug(f"Successfully registered blueprint: {name} at {url_prefix}")
            return True

        except Exception as e:
            error = {
                "name": name,
                "type": "registration",
                "error": str(e),
                "prefix": url_prefix
            }
            self.registration_errors.append(error)
            logger.error(f"Failed to register blueprint '{name}': {e}")
            return False

    def _log_summary(self):
        """Log a summary of blueprint loading"""
        total = len(BLUEPRINT_CONFIG)
        success = len(self.registered)
        failed = len(self.import_errors) + len(self.registration_errors)

        if failed == 0:
            logger.info(f"All {total} blueprints loaded successfully")
        else:
            logger.warning(
                f"Blueprint loading: {success}/{total} successful, {failed} failed"
            )

            # Log individual errors
            for error in self.import_errors:
                logger.error(f"  Import error [{error['name']}]: {error['error']}")

            for error in self.registration_errors:
                logger.error(f"  Registration error [{error['name']}]: {error['error']}")

    def get_status(self) -> Dict:
        """Get detailed status of blueprint loading"""
        return {
            "registered": self.registered,
            "count": len(self.registered),
            "total": len(BLUEPRINT_CONFIG),
            "import_errors": self.import_errors,
            "registration_errors": self.registration_errors,
            "success_rate": f"{len(self.registered)}/{len(BLUEPRINT_CONFIG)}"
        }


# ============================================================================
# CONVENIENCE FUNCTION
# ============================================================================

def load_blueprints(app: Flask) -> Tuple[List[str], List[Dict]]:
    """
    Convenience function to load all blueprints.

    Args:
        app: Flask application instance

    Returns:
        Tuple of (registered_blueprints, errors)
    """
    loader = BlueprintLoader(app)
    registered, errors = loader.load_all()

    # Store status in app config for later access
    app.config['BLUEPRINTS_REGISTERED'] = registered
    app.config['BLUEPRINT_ERRORS'] = errors
    app.config['BLUEPRINT_STATUS'] = loader.get_status()

    return registered, errors


# ============================================================================
# EXPORTS
# ============================================================================

__all__ = [
    'BLUEPRINT_CONFIG',
    'BlueprintLoader',
    'load_blueprints',
]
