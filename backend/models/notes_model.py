from extensions import db
from datetime import datetime, timedelta
from sqlalchemy.dialects.postgresql import UUID
import uuid

class Note(db.Model):
    __tablename__ = 'notes'

    note_id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = db.Column(UUID(as_uuid=True), db.ForeignKey('users.user_id'), nullable=False)
    title = db.Column(db.String(255))
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)

    # Relationship to user
    user = db.relationship('User', backref='notes')

    def __init__(self, user_id, content, title=None, days_to_keep=5):
        self.note_id = uuid.uuid4()
        self.user_id = user_id
        self.title = title
        self.content = content
        self.created_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()
        self.expires_at = datetime.utcnow() + timedelta(days=days_to_keep)

    def to_dict(self):
        return {
            'note_id': str(self.note_id),
            'user_id': str(self.user_id),
            'title': self.title,
            'content': self.content,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'days_remaining': (self.expires_at - datetime.utcnow()).days if self.expires_at else 0
        }

    @staticmethod
    def clean_expired_notes():
        """Remove notes that have expired"""
        expired_notes = Note.query.filter(Note.expires_at < datetime.utcnow()).all()
        for note in expired_notes:
            db.session.delete(note)
        db.session.commit()
        return len(expired_notes)
