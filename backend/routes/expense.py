import uuid
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, g
from sqlalchemy import func, and_, extract
from extensions import db
from models.expense_model import Expense, ExpenseSummary
from utils.auth_middleware import authenticate
from utils.audit_logger import log_action
from decimal import Decimal

expense_bp = Blueprint('expense', __name__)


@expense_bp.route('/create', methods=['POST'])
@authenticate
def create_expense():
    """Create a new expense entry"""
    try:
        data = request.get_json()
        client_id = g.user['client_id']
        user_id = g.user['user_id']

        # Validate required fields
        required_fields = ['category', 'amount', 'expense_date']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400

        # Parse expense date
        expense_date = datetime.fromisoformat(data['expense_date']).date()

        # Create expense
        new_expense = Expense(
            expense_id=str(uuid.uuid4()),
            client_id=client_id,
            category=data['category'],
            description=data.get('description', ''),
            amount=Decimal(str(data['amount'])),
            expense_date=expense_date,
            payment_method=data.get('payment_method', 'cash'),
            receipt_url=data.get('receipt_url'),
            notes=data.get('notes'),
            extra_data=data.get('extra_data'),
            created_by=user_id,
            created_at=datetime.utcnow()
        )

        db.session.add(new_expense)
        db.session.commit()

        # Update summaries asynchronously or via background job in production
        update_expense_summaries(client_id, expense_date)

        log_action('CREATE', 'expense', new_expense.expense_id, None, new_expense.to_dict())

        return jsonify({
            'success': True,
            'expense': new_expense.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to create expense', 'message': str(e)}), 500


@expense_bp.route('/list', methods=['GET'])
@authenticate
def list_expenses():
    """List expenses with filtering"""
    try:
        client_id = g.user['client_id']

        # Get query parameters
        date_from = request.args.get('date_from')
        date_to = request.args.get('date_to')
        category = request.args.get('category')
        limit = int(request.args.get('limit', 100))
        offset = int(request.args.get('offset', 0))

        # Build query
        query = Expense.query.filter_by(client_id=client_id)

        if date_from:
            query = query.filter(Expense.expense_date >= datetime.fromisoformat(date_from).date())
        if date_to:
            query = query.filter(Expense.expense_date <= datetime.fromisoformat(date_to).date())
        if category:
            query = query.filter(Expense.category == category)

        # Get total count
        total_count = query.count()

        # Get expenses
        expenses = query.order_by(Expense.expense_date.desc(), Expense.created_at.desc())\
            .limit(limit).offset(offset).all()

        return jsonify({
            'success': True,
            'expenses': [expense.to_dict() for expense in expenses],
            'total': total_count,
            'limit': limit,
            'offset': offset
        }), 200

    except Exception as e:
        return jsonify({'error': 'Failed to fetch expenses', 'message': str(e)}), 500


@expense_bp.route('/<expense_id>', methods=['GET'])
@authenticate
def get_expense(expense_id):
    """Get single expense details"""
    try:
        client_id = g.user['client_id']

        expense = Expense.query.filter_by(
            expense_id=expense_id,
            client_id=client_id
        ).first()

        if not expense:
            return jsonify({'error': 'Expense not found'}), 404

        return jsonify({
            'success': True,
            'expense': expense.to_dict()
        }), 200

    except Exception as e:
        return jsonify({'error': 'Failed to fetch expense', 'message': str(e)}), 500


@expense_bp.route('/<expense_id>', methods=['PUT'])
@authenticate
def update_expense(expense_id):
    """Update an expense entry"""
    try:
        client_id = g.user['client_id']
        data = request.get_json()

        expense = Expense.query.filter_by(
            expense_id=expense_id,
            client_id=client_id
        ).first()

        if not expense:
            return jsonify({'error': 'Expense not found'}), 404

        # Store old data for audit
        old_data = expense.to_dict()

        # Update fields
        if 'category' in data:
            expense.category = data['category']
        if 'description' in data:
            expense.description = data['description']
        if 'amount' in data:
            expense.amount = Decimal(str(data['amount']))
        if 'expense_date' in data:
            expense.expense_date = datetime.fromisoformat(data['expense_date']).date()
        if 'payment_method' in data:
            expense.payment_method = data['payment_method']
        if 'receipt_url' in data:
            expense.receipt_url = data['receipt_url']
        if 'notes' in data:
            expense.notes = data['notes']
        if 'extra_data' in data:
            expense.extra_data = data['extra_data']

        expense.updated_at = datetime.utcnow()

        db.session.commit()

        # Update summaries
        update_expense_summaries(client_id, expense.expense_date)

        log_action('UPDATE', 'expense', expense_id, old_data, expense.to_dict())

        return jsonify({
            'success': True,
            'expense': expense.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to update expense', 'message': str(e)}), 500


@expense_bp.route('/<expense_id>', methods=['DELETE'])
@authenticate
def delete_expense(expense_id):
    """Delete an expense entry"""
    try:
        client_id = g.user['client_id']

        expense = Expense.query.filter_by(
            expense_id=expense_id,
            client_id=client_id
        ).first()

        if not expense:
            return jsonify({'error': 'Expense not found'}), 404

        old_data = expense.to_dict()
        expense_date = expense.expense_date

        db.session.delete(expense)
        db.session.commit()

        # Update summaries
        update_expense_summaries(client_id, expense_date)

        log_action('DELETE', 'expense', expense_id, old_data, None)

        return jsonify({
            'success': True,
            'message': 'Expense deleted successfully'
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to delete expense', 'message': str(e)}), 500


@expense_bp.route('/summary', methods=['GET'])
@authenticate
def get_expense_summary():
    """Get expense summary by time period"""
    try:
        client_id = g.user['client_id']

        # Get query parameters
        period_type = request.args.get('period_type', 'day')  # day, week, month, year
        date_from = request.args.get('date_from')
        date_to = request.args.get('date_to')

        if not date_from or not date_to:
            return jsonify({'error': 'date_from and date_to are required'}), 400

        start_date = datetime.fromisoformat(date_from).date()
        end_date = datetime.fromisoformat(date_to).date()

        # Get expenses for the period
        expenses = Expense.query.filter(
            Expense.client_id == client_id,
            Expense.expense_date >= start_date,
            Expense.expense_date <= end_date
        ).all()

        # Calculate summary
        total_expenses = sum(float(expense.amount) for expense in expenses)

        # Category breakdown
        category_breakdown = {}
        for expense in expenses:
            category = expense.category
            category_breakdown[category] = category_breakdown.get(category, 0) + float(expense.amount)

        # Time-based breakdown
        time_breakdown = []
        if period_type == 'day':
            # Group by day
            daily_map = {}
            for expense in expenses:
                date_key = expense.expense_date.isoformat()
                if date_key not in daily_map:
                    daily_map[date_key] = {'date': date_key, 'amount': 0, 'count': 0}
                daily_map[date_key]['amount'] += float(expense.amount)
                daily_map[date_key]['count'] += 1
            time_breakdown = list(daily_map.values())

        elif period_type == 'week':
            # Group by week
            weekly_map = {}
            for expense in expenses:
                week_start = expense.expense_date - timedelta(days=expense.expense_date.weekday())
                week_key = week_start.isoformat()
                if week_key not in weekly_map:
                    weekly_map[week_key] = {'week_start': week_key, 'amount': 0, 'count': 0}
                weekly_map[week_key]['amount'] += float(expense.amount)
                weekly_map[week_key]['count'] += 1
            time_breakdown = list(weekly_map.values())

        elif period_type == 'month':
            # Group by month
            monthly_map = {}
            for expense in expenses:
                month_key = f"{expense.expense_date.year}-{expense.expense_date.month:02d}"
                if month_key not in monthly_map:
                    monthly_map[month_key] = {'month': month_key, 'amount': 0, 'count': 0}
                monthly_map[month_key]['amount'] += float(expense.amount)
                monthly_map[month_key]['count'] += 1
            time_breakdown = list(monthly_map.values())

        elif period_type == 'year':
            # Group by year
            yearly_map = {}
            for expense in expenses:
                year_key = str(expense.expense_date.year)
                if year_key not in yearly_map:
                    yearly_map[year_key] = {'year': year_key, 'amount': 0, 'count': 0}
                yearly_map[year_key]['amount'] += float(expense.amount)
                yearly_map[year_key]['count'] += 1
            time_breakdown = list(yearly_map.values())

        return jsonify({
            'success': True,
            'summary': {
                'period_type': period_type,
                'date_from': date_from,
                'date_to': date_to,
                'total_expenses': total_expenses,
                'expense_count': len(expenses),
                'category_breakdown': category_breakdown,
                'time_breakdown': sorted(time_breakdown, key=lambda x: list(x.values())[0])
            }
        }), 200

    except Exception as e:
        return jsonify({'error': 'Failed to fetch expense summary', 'message': str(e)}), 500


@expense_bp.route('/categories', methods=['GET'])
@authenticate
def get_expense_categories():
    """Get list of expense categories used by client"""
    try:
        client_id = g.user['client_id']

        # Get distinct categories
        categories = db.session.query(Expense.category).filter_by(
            client_id=client_id
        ).distinct().all()

        # Default categories
        default_categories = [
            'Rent',
            'Utilities',
            'Salary',
            'Supplies',
            'Maintenance',
            'Transportation',
            'Marketing',
            'Other'
        ]

        # Combine with used categories
        used_categories = [cat[0] for cat in categories]
        all_categories = list(set(default_categories + used_categories))

        return jsonify({
            'success': True,
            'categories': sorted(all_categories)
        }), 200

    except Exception as e:
        return jsonify({'error': 'Failed to fetch categories', 'message': str(e)}), 500


def update_expense_summaries(client_id, expense_date):
    """Update expense summaries for different time periods"""
    try:
        # This is a simplified version. In production, use background jobs
        # Update daily summary
        start_of_day = expense_date
        end_of_day = expense_date

        update_summary(client_id, 'day', start_of_day, end_of_day)

        # Update weekly summary
        start_of_week = expense_date - timedelta(days=expense_date.weekday())
        end_of_week = start_of_week + timedelta(days=6)
        update_summary(client_id, 'week', start_of_week, end_of_week)

        # Update monthly summary
        start_of_month = expense_date.replace(day=1)
        if expense_date.month == 12:
            end_of_month = expense_date.replace(year=expense_date.year + 1, month=1, day=1) - timedelta(days=1)
        else:
            end_of_month = expense_date.replace(month=expense_date.month + 1, day=1) - timedelta(days=1)
        update_summary(client_id, 'month', start_of_month, end_of_month)

        # Update yearly summary
        start_of_year = expense_date.replace(month=1, day=1)
        end_of_year = expense_date.replace(month=12, day=31)
        update_summary(client_id, 'year', start_of_year, end_of_year)

    except Exception as e:
        print(f"Error updating summaries: {str(e)}")


def update_summary(client_id, period_type, start_date, end_date):
    """Update or create a summary for a specific period"""
    try:
        # Get expenses for the period
        expenses = Expense.query.filter(
            Expense.client_id == client_id,
            Expense.expense_date >= start_date,
            Expense.expense_date <= end_date
        ).all()

        # Calculate totals
        total_expenses = sum(float(expense.amount) for expense in expenses)

        # Category breakdown
        category_breakdown = {}
        for expense in expenses:
            category = expense.category
            category_breakdown[category] = category_breakdown.get(category, 0) + float(expense.amount)

        # Check if summary exists
        summary = ExpenseSummary.query.filter_by(
            client_id=client_id,
            period_type=period_type,
            period_start=start_date,
            period_end=end_date
        ).first()

        if summary:
            # Update existing summary
            summary.total_expenses = Decimal(str(total_expenses))
            summary.category_breakdown = category_breakdown
            summary.expense_count = len(expenses)
            summary.updated_at = datetime.utcnow()
        else:
            # Create new summary
            summary = ExpenseSummary(
                summary_id=str(uuid.uuid4()),
                client_id=client_id,
                period_type=period_type,
                period_start=start_date,
                period_end=end_date,
                total_expenses=Decimal(str(total_expenses)),
                category_breakdown=category_breakdown,
                expense_count=len(expenses),
                created_at=datetime.utcnow()
            )
            db.session.add(summary)

        db.session.commit()

    except Exception as e:
        db.session.rollback()
        print(f"Error updating summary: {str(e)}")
