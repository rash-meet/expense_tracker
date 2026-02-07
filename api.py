# api.py - REST API endpoints for PWA offline sync with JWT Authentication + TOTP 2FA

from flask import Blueprint, jsonify, request, send_file
from bson.objectid import ObjectId
from datetime import datetime, timedelta
from functools import wraps
import pytz
import jwt
import pyotp
import qrcode
import os
from io import BytesIO

IST = pytz.timezone('Asia/Kolkata')

api = Blueprint('api', __name__, url_prefix='/api')

# These will be set from app.py
expenses_collection = None
savings_collection = None

# Auth config - loaded from environment
AUTH_USERNAME = None
AUTH_PASSWORD = None
JWT_SECRET = None
TOTP_SECRET = None
TOTP_ISSUER = "Expense Tracker"

def init_api(expenses, savings):
    global expenses_collection, savings_collection
    global AUTH_USERNAME, AUTH_PASSWORD, JWT_SECRET, TOTP_SECRET
    
    expenses_collection = expenses
    savings_collection = savings
    
    # Load auth config
    AUTH_USERNAME = os.getenv("AUTH_USERNAME", "admin")
    AUTH_PASSWORD = os.getenv("AUTH_PASSWORD", "changeme")
    JWT_SECRET = os.getenv("JWT_SECRET", "jwt-secret-key-change-in-production")
    TOTP_SECRET = os.getenv("TOTP_SECRET")
    
    # Generate TOTP secret if not set (for first-time setup)
    if not TOTP_SECRET:
        TOTP_SECRET = pyotp.random_base32()
        print(f"\n[TOTP] No TOTP_SECRET found! Generated new secret: {TOTP_SECRET}")
        print(f"[TOTP] Add this to your environment variables and restart.\n")


# ==================== AUTHENTICATION ====================

def require_auth(f):
    """Decorator to require JWT authentication for API endpoints"""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        # Check for token in Authorization header
        auth_header = request.headers.get('Authorization')
        if auth_header:
            parts = auth_header.split()
            if len(parts) == 2 and parts[0].lower() == 'bearer':
                token = parts[1]
        
        if not token:
            return jsonify({'error': 'Authentication required', 'code': 'NO_TOKEN'}), 401
        
        try:
            # Decode and verify the token
            payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
            request.user = payload.get('sub')
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token has expired', 'code': 'TOKEN_EXPIRED'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token', 'code': 'INVALID_TOKEN'}), 401
        
        return f(*args, **kwargs)
    return decorated


@api.route('/login', methods=['POST'])
def login():
    """Login endpoint - requires username, password, and TOTP code"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'Missing request body'}), 400
        
        username = data.get('username', '').strip()
        password = data.get('password', '')
        totp_code = data.get('totp_code', '').strip()
        
        if not username or not password:
            return jsonify({'error': 'Username and password required'}), 400
        
        if not totp_code:
            return jsonify({'error': 'TOTP code required', 'code': 'TOTP_REQUIRED'}), 400
        
        # Validate credentials first
        if username != AUTH_USERNAME or password != AUTH_PASSWORD:
            return jsonify({'error': 'Invalid credentials'}), 401
        
        # Verify TOTP code
        totp = pyotp.TOTP(TOTP_SECRET)
        if not totp.verify(totp_code, valid_window=1):  # Allow 1 window before/after for clock drift
            return jsonify({'error': 'Invalid TOTP code', 'code': 'INVALID_TOTP'}), 401
        
        # Generate JWT token with 7-day expiry
        expiry_time = datetime.utcnow() + timedelta(days=7)
        
        token = jwt.encode({
            'sub': username,
            'iat': datetime.utcnow(),
            'exp': expiry_time
        }, JWT_SECRET, algorithm='HS256')
        
        return jsonify({
            'success': True,
            'token': token,
            'expires_at': expiry_time.isoformat() + 'Z',
            'expires_in': 604800  # 7 days in seconds
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api.route('/totp-setup', methods=['GET'])
def totp_setup():
    """Get QR code for TOTP setup - only use this once during initial setup!"""
    try:
        # Generate provisioning URI for authenticator app
        totp = pyotp.TOTP(TOTP_SECRET)
        provisioning_uri = totp.provisioning_uri(
            name="rashmeetmailme@gmail.com",
            issuer_name=TOTP_ISSUER
        )
        
        # Generate QR code
        qr = qrcode.QRCode(version=1, box_size=10, border=5)
        qr.add_data(provisioning_uri)
        qr.make(fit=True)
        
        img = qr.make_image(fill_color="black", back_color="white")
        
        # Save to bytes buffer
        buffer = BytesIO()
        img.save(buffer, format='PNG')
        buffer.seek(0)
        
        return send_file(buffer, mimetype='image/png')
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api.route('/verify', methods=['GET'])
@require_auth
def verify_token():
    """Verify if the current token is valid"""
    return jsonify({
        'valid': True,
        'user': request.user,
        'timestamp': datetime.now(IST).isoformat()
    })


# ==================== HEALTH CHECK ====================

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


# ==================== EXPENSES API ====================

@api.route('/expenses', methods=['GET'])
@require_auth
def get_expenses():
    """Get expenses with optional date range filtering and pagination"""
    try:
        query = {}
        from_date = request.args.get('from_date')
        to_date = request.args.get('to_date')
        category = request.args.get('category')
        payment_mode = request.args.get('payment_mode')
        
        # Filters
        if from_date:
            query.setdefault('date', {})['$gte'] = datetime.strptime(from_date, '%Y-%m-%d')
        if to_date:
            query.setdefault('date', {})['$lte'] = datetime.strptime(to_date, '%Y-%m-%d')
        if category:
            query['category'] = category
        if payment_mode:
            query['payment_mode'] = payment_mode
            
        # Pagination
        page = request.args.get('page', 1, type=int)
        limit = request.args.get('limit', 50, type=int)
        skip = (page - 1) * limit
        
        total_count = expenses_collection.count_documents(query)
        expenses = list(expenses_collection.find(query).sort('date', -1).skip(skip).limit(limit))
        
        # Convert ObjectId and datetime to string for JSON
        for exp in expenses:
            exp['_id'] = str(exp['_id'])
            exp['date'] = exp['date'].strftime('%Y-%m-%d')
        
        return jsonify({
            'success': True, 
            'data': expenses,
            'pagination': {
                'page': page,
                'limit': limit,
                'total': total_count,
                'pages': (total_count + limit - 1) // limit
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@api.route('/expenses', methods=['POST'])
@require_auth
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


@api.route('/expenses/<id>', methods=['PUT'])
@require_auth
def update_expense(id):
    """Update an existing expense"""
    try:
        data = request.get_json()
        
        updated = {
            'amount': float(data['amount']),
            'category': data['category'],
            'payment_mode': data.get('payment_mode', 'Cash'),
            'date': datetime.strptime(data['date'], '%Y-%m-%d'),
            'time': data.get('time', ''),
            'note': data.get('note', '')
        }
        
        result = expenses_collection.update_one(
            {'_id': ObjectId(id)}, 
            {'$set': updated}
        )
        
        if result.matched_count == 0:
            return jsonify({'success': False, 'error': 'Expense not found'}), 404
        
        return jsonify({'success': True, 'modified': result.modified_count})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@api.route('/expenses/<id>', methods=['DELETE'])
@require_auth
def delete_expense(id):
    """Delete an expense"""
    try:
        result = expenses_collection.delete_one({'_id': ObjectId(id)})
        
        if result.deleted_count == 0:
            return jsonify({'success': False, 'error': 'Expense not found'}), 404
        
        return jsonify({'success': True, 'deleted': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ==================== SAVINGS API ====================

@api.route('/savings', methods=['GET'])
@require_auth
def get_savings():
    """Get savings with optional date range filtering and pagination"""
    try:
        query = {}
        from_date = request.args.get('from_date')
        to_date = request.args.get('to_date')
        mode = request.args.get('saving_mode')
        
        # Filters
        if from_date:
            query.setdefault('date', {})['$gte'] = datetime.strptime(from_date, '%Y-%m-%d')
        if to_date:
            query.setdefault('date', {})['$lte'] = datetime.strptime(to_date, '%Y-%m-%d')
        if mode:
            query['saving_mode'] = mode
            
        # Pagination
        page = request.args.get('page', 1, type=int)
        limit = request.args.get('limit', 50, type=int)
        skip = (page - 1) * limit
        
        total_count = savings_collection.count_documents(query)
        savings = list(savings_collection.find(query).sort('date', -1).skip(skip).limit(limit))
        
        for sav in savings:
            sav['_id'] = str(sav['_id'])
            sav['date'] = sav['date'].strftime('%Y-%m-%d')
        
        return jsonify({
            'success': True, 
            'data': savings,
            'pagination': {
                'page': page,
                'limit': limit,
                'total': total_count,
                'pages': (total_count + limit - 1) // limit
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@api.route('/savings', methods=['POST'])
@require_auth
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


@api.route('/savings/<id>', methods=['PUT'])
@require_auth
def update_saving(id):
    """Update an existing saving"""
    try:
        data = request.get_json()
        
        updated = {
            'amount': float(data['amount']),
            'saving_mode': data['saving_mode'],
            'date': datetime.strptime(data['date'], '%Y-%m-%d'),
            'time': data.get('time', ''),
            'note': data.get('note', '')
        }
        
        result = savings_collection.update_one(
            {'_id': ObjectId(id)}, 
            {'$set': updated}
        )
        
        if result.matched_count == 0:
            return jsonify({'success': False, 'error': 'Saving not found'}), 404
        
        return jsonify({'success': True, 'modified': result.modified_count})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@api.route('/savings/<id>', methods=['DELETE'])
@require_auth
def delete_saving(id):
    """Delete a saving"""
    try:
        result = savings_collection.delete_one({'_id': ObjectId(id)})
        
        if result.deleted_count == 0:
            return jsonify({'success': False, 'error': 'Saving not found'}), 404
        
        return jsonify({'success': True, 'deleted': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ==================== SYNC API ====================

@api.route('/sync', methods=['POST'])
@require_auth
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


@api.route('/delete-bulk', methods=['POST'])
@require_auth
def delete_bulk():
    """Bulk delete data based on filters, protected by password"""
    try:
        data = request.get_json()
        password = data.get('password')
        filters = data.get('filters', {})
        collection_type = data.get('type')  # 'expense' or 'saving'
        
        # 1. Password Verification
        if password != AUTH_PASSWORD:
            return jsonify({'success': False, 'error': 'Incorrect password'}), 403
            
        # 2. Select Collection
        if collection_type == 'expense':
            collection = expenses_collection
        elif collection_type == 'saving':
            collection = savings_collection
        else:
            return jsonify({'success': False, 'error': 'Invalid type'}), 400
            
        # 3. Build Query
        query = {}
        if filters.get('from_date'):
            query.setdefault('date', {})['$gte'] = datetime.strptime(filters['from_date'], '%Y-%m-%d')
        if filters.get('to_date'):
            query.setdefault('date', {})['$lte'] = datetime.strptime(filters['to_date'], '%Y-%m-%d')
            
        if collection_type == 'expense':
            if filters.get('category'):
                query['category'] = filters['category']
            if filters.get('payment_mode'):
                query['payment_mode'] = filters['payment_mode']
        else:
            if filters.get('saving_mode'):
                query['saving_mode'] = filters['saving_mode']
                
        # 4. Filter empty/danger check (Prevent deleting EVERYTHING unless explicitly requested with no filters??
        # Actually, user might want to delete everything. Let's just trust filter is intentional.)
        # If no filters provided, it deletes EVERYTHING in that collection.
        
        # 5. Execute Delete
        result = collection.delete_many(query)
        
        return jsonify({
            'success': True, 
            'deleted_count': result.deleted_count,
            'message': f"Successfully deleted {result.deleted_count} records."
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ==================== STATISTICS API ====================

@api.route('/stats', methods=['GET'])
@require_auth
def get_stats():
    """Get expense and savings statistics"""
    try:
        from datetime import date
        
        # Current month boundaries
        today = datetime.now(IST)
        start_of_month = datetime(today.year, today.month, 1)
        if today.month == 12:
            end_of_month = datetime(today.year + 1, 1, 1)
        else:
            end_of_month = datetime(today.year, today.month + 1, 1)
        
        month_query = {'date': {'$gte': start_of_month, '$lt': end_of_month}}
        
        # Calculate totals
        all_expenses = list(expenses_collection.find())
        all_savings = list(savings_collection.find())
        month_expenses = list(expenses_collection.find(month_query))
        month_savings = list(savings_collection.find(month_query))
        
        # Get distinct categories and modes
        categories = expenses_collection.distinct('category')
        payment_modes = expenses_collection.distinct('payment_mode')
        saving_modes = savings_collection.distinct('saving_mode')
        
        return jsonify({
            'success': True,
            'data': {
                'total_expenses': sum(e['amount'] for e in all_expenses),
                'total_savings': sum(s['amount'] for s in all_savings),
                'month_expenses': sum(e['amount'] for e in month_expenses),
                'month_savings': sum(s['amount'] for s in month_savings),
                'expense_count': len(all_expenses),
                'savings_count': len(all_savings),
                'categories': categories,
                'payment_modes': payment_modes,
                'saving_modes': saving_modes,
                'current_month': today.strftime('%B %Y')
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
