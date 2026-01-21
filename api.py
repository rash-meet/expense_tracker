# api.py - REST API endpoints for PWA offline sync

from flask import Blueprint, jsonify, request
from bson.objectid import ObjectId
from datetime import datetime
import pytz

IST = pytz.timezone('Asia/Kolkata')

api = Blueprint('api', __name__, url_prefix='/api')

# These will be set from app.py
expenses_collection = None
savings_collection = None

def init_api(expenses, savings):
    global expenses_collection, savings_collection
    expenses_collection = expenses
    savings_collection = savings

@api.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint to verify backend connectivity"""
    try:
        # Try to ping the database
        expenses_collection.database.command('ping')
        return jsonify({
            'status': 'connected',
            'timestamp': datetime.now(IST).isoformat(),
            'database': 'ok'
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'timestamp': datetime.now(IST).isoformat(),
            'error': str(e)
        }), 503

@api.route('/expenses', methods=['GET'])
def get_expenses():
    """Get expenses with optional date range filtering"""

    try:
        query = {}
        from_date = request.args.get('from_date')
        to_date = request.args.get('to_date')
        limit = request.args.get('limit', 100, type=int)
        
        if from_date:
            query['date'] = {'$gte': datetime.strptime(from_date, '%Y-%m-%d')}
        if to_date:
            if 'date' in query:
                query['date']['$lte'] = datetime.strptime(to_date, '%Y-%m-%d')
            else:
                query['date'] = {'$lte': datetime.strptime(to_date, '%Y-%m-%d')}
        
        expenses = list(expenses_collection.find(query).sort('date', -1).limit(limit))
        
        # Convert ObjectId and datetime to string for JSON
        for exp in expenses:
            exp['_id'] = str(exp['_id'])
            exp['date'] = exp['date'].strftime('%Y-%m-%d')
        
        return jsonify({'success': True, 'data': expenses})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@api.route('/expenses', methods=['POST'])
def add_expense():
    """Add a new expense"""
    try:
        data = request.get_json()
        
        expense = {
            'amount': float(data['amount']),
            'category': data['category'],
            'payment_mode': data.get('payment_mode', 'Cash'),
            'date': datetime.strptime(data['date'], '%Y-%m-%d'),
            'time': data.get('time', datetime.now(IST).strftime('%H:%M')),
            'note': data.get('note', '')
        }
        
        result = expenses_collection.insert_one(expense)
        return jsonify({'success': True, 'id': str(result.inserted_id)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@api.route('/savings', methods=['GET'])
def get_savings():
    """Get savings with optional date range filtering"""
    try:
        query = {}
        from_date = request.args.get('from_date')
        to_date = request.args.get('to_date')
        limit = request.args.get('limit', 100, type=int)
        
        if from_date:
            query['date'] = {'$gte': datetime.strptime(from_date, '%Y-%m-%d')}
        if to_date:
            if 'date' in query:
                query['date']['$lte'] = datetime.strptime(to_date, '%Y-%m-%d')
            else:
                query['date'] = {'$lte': datetime.strptime(to_date, '%Y-%m-%d')}
        
        savings = list(savings_collection.find(query).sort('date', -1).limit(limit))
        
        for sav in savings:
            sav['_id'] = str(sav['_id'])
            sav['date'] = sav['date'].strftime('%Y-%m-%d')
        
        return jsonify({'success': True, 'data': savings})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@api.route('/savings', methods=['POST'])
def add_saving():
    """Add a new saving"""
    try:
        data = request.get_json()
        
        saving = {
            'amount': float(data['amount']),
            'saving_mode': data['saving_mode'],
            'date': datetime.strptime(data['date'], '%Y-%m-%d'),
            'time': data.get('time', datetime.now(IST).strftime('%H:%M')),
            'note': data.get('note', '')
        }
        
        result = savings_collection.insert_one(saving)
        return jsonify({'success': True, 'id': str(result.inserted_id)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@api.route('/sync', methods=['POST'])
def bulk_sync():
    """Bulk sync endpoint for syncing multiple items at once"""
    try:
        data = request.get_json()
        results = {'expenses': [], 'savings': []}
        
        # Process expenses
        for expense in data.get('expenses', []):
            try:
                exp = {
                    'amount': float(expense['amount']),
                    'category': expense['category'],
                    'payment_mode': expense.get('payment_mode', 'Cash'),
                    'date': datetime.strptime(expense['date'], '%Y-%m-%d'),
                    'time': expense.get('time', ''),
                    'note': expense.get('note', '')
                }
                result = expenses_collection.insert_one(exp)
                results['expenses'].append({'success': True, 'id': str(result.inserted_id)})
            except Exception as e:
                results['expenses'].append({'success': False, 'error': str(e)})
        
        # Process savings
        for saving in data.get('savings', []):
            try:
                sav = {
                    'amount': float(saving['amount']),
                    'saving_mode': saving['saving_mode'],
                    'date': datetime.strptime(saving['date'], '%Y-%m-%d'),
                    'time': saving.get('time', ''),
                    'note': saving.get('note', '')
                }
                result = savings_collection.insert_one(sav)
                results['savings'].append({'success': True, 'id': str(result.inserted_id)})
            except Exception as e:
                results['savings'].append({'success': False, 'error': str(e)})
        
        return jsonify({'success': True, 'results': results})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
