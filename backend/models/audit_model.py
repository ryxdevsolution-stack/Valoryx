from extensions import db
from datetime import datetime
from sqlalchemy.dialects.postgresql import JSONB
from database.flexible_types import FlexibleUUID, FlexibleJSON

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
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

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
