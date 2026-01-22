from extensions import db
from datetime import datetime
import pytz
from sqlalchemy.dialects.postgresql import JSONB
from database.flexible_types import FlexibleUUID, FlexibleJSON

def get_current_time():
    """Returns current datetime in Asia/Kolkata timezone as naive datetime"""
    kolkata_tz = pytz.timezone('Asia/Kolkata')
    # Get timezone-aware datetime in IST, then convert to naive for SQLite compatibility
    aware_dt = datetime.now(kolkata_tz)
    # Return naive datetime (without timezone info) representing IST time
    return aware_dt.replace(tzinfo=None)

class AuditLog(db.Model):
    """Complete audit trail of all actions"""
    __tablename__ = 'audit_log'

    log_id = db.Column(FlexibleUUID, primary_key=True)
    client_id = db.Column(FlexibleUUID, db.ForeignKey('client_entry.client_id'), nullable=False, index=True)
    user_id = db.Column(FlexibleUUID, db.ForeignKey('users.user_id'))
    action_type = db.Column(db.String(50), nullable=False)
    table_name = db.Column(db.String(100))
    record_id = db.Column(FlexibleUUID)
    old_data = db.Column(FlexibleJSON)
    new_data = db.Column(FlexibleJSON)
    ip_address = db.Column(db.String(45))
    user_agent = db.Column(db.Text)
    timestamp = db.Column(db.DateTime, default=get_current_time)

    def to_dict(self):
        return {
            'log_id': self.log_id,
            'client_id': self.client_id,
            'user_id': self.user_id,
            'action_type': self.action_type,
            'table_name': self.table_name,
            'record_id': self.record_id,
            'old_data': self.old_data,
            'new_data': self.new_data,
            'ip_address': self.ip_address,
            'user_agent': self.user_agent,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None
        }
