"""
Sync Metadata Model - Tracks synchronization state between SQLite and Supabase
"""
from extensions import db
from database.flexible_types import FlexibleUUID, FlexibleJSON, FlexibleNumeric
from datetime import datetime
import uuid


class SyncMetadata(db.Model):
    """Tracks sync state for each table per client"""
    __tablename__ = 'sync_metadata'

    id = db.Column(FlexibleUUID, primary_key=True, default=lambda: str(uuid.uuid4()))
    client_id = db.Column(FlexibleUUID, db.ForeignKey('client_entry.client_id'), nullable=False, index=True)
    table_name = db.Column(db.String(100), nullable=False)

    # Sync timestamps
    last_upload_time = db.Column(db.DateTime, nullable=True)  # Last time data was pushed to Supabase
    last_download_time = db.Column(db.DateTime, nullable=True)  # Last time data was pulled from Supabase
    last_full_sync_time = db.Column(db.DateTime, nullable=True)  # Last time a full sync was done

    # Sync statistics
    records_uploaded = db.Column(db.Integer, default=0)
    records_downloaded = db.Column(db.Integer, default=0)
    last_upload_count = db.Column(db.Integer, default=0)
    last_download_count = db.Column(db.Integer, default=0)

    # Sync status
    sync_status = db.Column(db.String(50), default='idle')  # idle, syncing, error
    last_error = db.Column(db.Text, nullable=True)
    last_error_time = db.Column(db.DateTime, nullable=True)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Unique constraint: one record per client per table
    __table_args__ = (
        db.UniqueConstraint('client_id', 'table_name', name='unique_client_table_sync'),
        db.Index('idx_sync_client_table', 'client_id', 'table_name'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'client_id': self.client_id,
            'table_name': self.table_name,
            'last_upload_time': self.last_upload_time.isoformat() if self.last_upload_time else None,
            'last_download_time': self.last_download_time.isoformat() if self.last_download_time else None,
            'last_full_sync_time': self.last_full_sync_time.isoformat() if self.last_full_sync_time else None,
            'records_uploaded': self.records_uploaded,
            'records_downloaded': self.records_downloaded,
            'last_upload_count': self.last_upload_count,
            'last_download_count': self.last_download_count,
            'sync_status': self.sync_status,
            'last_error': self.last_error,
            'last_error_time': self.last_error_time.isoformat() if self.last_error_time else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

    @staticmethod
    def get_or_create(client_id, table_name):
        """Get existing sync metadata or create new one"""
        metadata = SyncMetadata.query.filter_by(
            client_id=client_id,
            table_name=table_name
        ).first()

        if not metadata:
            metadata = SyncMetadata(
                id=str(uuid.uuid4()),
                client_id=client_id,
                table_name=table_name
            )
            db.session.add(metadata)
            db.session.commit()

        return metadata

    def update_upload_time(self, count=0):
        """Update after successful upload sync"""
        self.last_upload_time = datetime.utcnow()
        self.last_upload_count = count
        self.records_uploaded += count
        self.sync_status = 'idle'
        self.updated_at = datetime.utcnow()
        db.session.commit()

    def update_download_time(self, count=0):
        """Update after successful download sync"""
        self.last_download_time = datetime.utcnow()
        self.last_download_count = count
        self.records_downloaded += count
        self.sync_status = 'idle'
        self.updated_at = datetime.utcnow()
        db.session.commit()

    def update_full_sync_time(self):
        """Update after successful full sync"""
        self.last_full_sync_time = datetime.utcnow()
        self.sync_status = 'idle'
        self.updated_at = datetime.utcnow()
        db.session.commit()

    def set_error(self, error_message):
        """Set error status"""
        self.sync_status = 'error'
        self.last_error = error_message
        self.last_error_time = datetime.utcnow()
        self.updated_at = datetime.utcnow()
        db.session.commit()

    def set_syncing(self):
        """Set syncing status"""
        self.sync_status = 'syncing'
        self.updated_at = datetime.utcnow()
        db.session.commit()


class SyncLog(db.Model):
    """Log of all sync operations for debugging and monitoring"""
    __tablename__ = 'sync_log'

    log_id = db.Column(FlexibleUUID, primary_key=True, default=lambda: str(uuid.uuid4()))
    client_id = db.Column(FlexibleUUID, db.ForeignKey('client_entry.client_id'), nullable=False, index=True)

    # Sync details
    sync_type = db.Column(db.String(50), nullable=False)  # upload, download, initial_load, full
    table_name = db.Column(db.String(100), nullable=True)  # Specific table or NULL for all
    direction = db.Column(db.String(20), nullable=False)  # sqlite_to_supabase, supabase_to_sqlite

    # Statistics
    records_processed = db.Column(db.Integer, default=0)
    records_success = db.Column(db.Integer, default=0)
    records_failed = db.Column(db.Integer, default=0)

    # Status
    status = db.Column(db.String(50), nullable=False)  # started, completed, failed
    error_message = db.Column(db.Text, nullable=True)

    # Timestamps
    started_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime, nullable=True)
    duration_seconds = db.Column(db.Integer, nullable=True)

    __table_args__ = (
        db.Index('idx_sync_log_client', 'client_id'),
        db.Index('idx_sync_log_time', 'started_at'),
    )

    def to_dict(self):
        return {
            'log_id': self.log_id,
            'client_id': self.client_id,
            'sync_type': self.sync_type,
            'table_name': self.table_name,
            'direction': self.direction,
            'records_processed': self.records_processed,
            'records_success': self.records_success,
            'records_failed': self.records_failed,
            'status': self.status,
            'error_message': self.error_message,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'duration_seconds': self.duration_seconds
        }

    def complete(self, success_count, failed_count):
        """Mark sync as completed"""
        self.status = 'completed'
        self.records_success = success_count
        self.records_failed = failed_count
        self.completed_at = datetime.utcnow()
        self.duration_seconds = int((self.completed_at - self.started_at).total_seconds())
        db.session.commit()

    def fail(self, error_message):
        """Mark sync as failed"""
        self.status = 'failed'
        self.error_message = error_message
        self.completed_at = datetime.utcnow()
        self.duration_seconds = int((self.completed_at - self.started_at).total_seconds())
        db.session.commit()
