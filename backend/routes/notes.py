from flask import Blueprint, request, jsonify, g
from extensions import db
from models.notes_model import Note
from utils.auth_middleware import authenticate
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

notes_bp = Blueprint('notes', __name__)

@notes_bp.route('/notes', methods=['GET'])
@authenticate
def get_notes():
    """Get all notes for the current user"""
    try:
        # Clean up expired notes first
        Note.clean_expired_notes()

        # Get user's notes
        notes = Note.query.filter_by(user_id=g.user['user_id']).order_by(Note.updated_at.desc()).all()

        return jsonify({
            'success': True,
            'notes': [note.to_dict() for note in notes]
        }), 200
    except Exception as e:
        logger.error(f"Error fetching notes: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch notes'
        }), 500

@notes_bp.route('/notes/<note_id>', methods=['GET'])
@authenticate
def get_note(note_id):
    """Get a specific note"""
    try:
        note = Note.query.filter_by(note_id=note_id, user_id=g.user['user_id']).first()

        if not note:
            return jsonify({
                'success': False,
                'error': 'Note not found'
            }), 404

        return jsonify({
            'success': True,
            'note': note.to_dict()
        }), 200
    except Exception as e:
        logger.error(f"Error fetching note: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch note'
        }), 500

@notes_bp.route('/notes', methods=['POST'])
@authenticate
def create_note():
    """Create a new note"""
    try:
        data = request.get_json()

        if not data or 'content' not in data:
            return jsonify({
                'success': False,
                'error': 'Content is required'
            }), 400

        content = data.get('content', '').strip()
        if not content:
            return jsonify({
                'success': False,
                'error': 'Content cannot be empty'
            }), 400

        title = data.get('title', '').strip() if data.get('title') else None
        days_to_keep = data.get('days_to_keep', 5)

        # Ensure minimum of 5 days
        if days_to_keep < 5:
            days_to_keep = 5

        note = Note(
            user_id=g.user['user_id'],
            content=content,
            title=title,
            days_to_keep=days_to_keep
        )

        db.session.add(note)
        db.session.commit()

        logger.info(f"Note created: {note.note_id} by user {g.user['user_id']}")

        return jsonify({
            'success': True,
            'message': 'Note created successfully',
            'note': note.to_dict()
        }), 201
    except Exception as e:
        logger.error(f"Error creating note: {str(e)}")
        db.session.rollback()
        return jsonify({
            'success': False,
            'error': 'Failed to create note'
        }), 500

@notes_bp.route('/notes/<note_id>', methods=['PUT'])
@authenticate
def update_note(note_id):
    """Update an existing note"""
    try:
        note = Note.query.filter_by(note_id=note_id, user_id=g.user['user_id']).first()

        if not note:
            return jsonify({
                'success': False,
                'error': 'Note not found'
            }), 404

        data = request.get_json()

        if 'content' in data:
            content = data['content'].strip()
            if not content:
                return jsonify({
                    'success': False,
                    'error': 'Content cannot be empty'
                }), 400
            note.content = content

        if 'title' in data:
            note.title = data['title'].strip() if data['title'] else None

        note.updated_at = datetime.utcnow()

        db.session.commit()

        logger.info(f"Note updated: {note.note_id} by user {g.user['user_id']}")

        return jsonify({
            'success': True,
            'message': 'Note updated successfully',
            'note': note.to_dict()
        }), 200
    except Exception as e:
        logger.error(f"Error updating note: {str(e)}")
        db.session.rollback()
        return jsonify({
            'success': False,
            'error': 'Failed to update note'
        }), 500

@notes_bp.route('/notes/<note_id>', methods=['DELETE'])
@authenticate
def delete_note(note_id):
    """Delete a note"""
    try:
        note = Note.query.filter_by(note_id=note_id, user_id=g.user['user_id']).first()

        if not note:
            return jsonify({
                'success': False,
                'error': 'Note not found'
            }), 404

        db.session.delete(note)
        db.session.commit()

        logger.info(f"Note deleted: {note_id} by user {g.user['user_id']}")

        return jsonify({
            'success': True,
            'message': 'Note deleted successfully'
        }), 200
    except Exception as e:
        logger.error(f"Error deleting note: {str(e)}")
        db.session.rollback()
        return jsonify({
            'success': False,
            'error': 'Failed to delete note'
        }), 500
