# app.py

# Set non-interactive backend FIRST (before any matplotlib/pyplot import)
import matplotlib
matplotlib.use('Agg')  # 👈 Important! Must be before importing pyplot
import matplotlib.pyplot as plt

from dotenv import load_dotenv
load_dotenv()

from flask import Flask, render_template, request, redirect, url_for, send_file, flash
from pymongo import MongoClient
from bson.objectid import ObjectId
import pandas as pd
from io import BytesIO
import os
import pytz

from datetime import datetime, date, timedelta

# IST Timezone
IST = pytz.timezone('Asia/Kolkata')

def get_ist_now():
    """Get current datetime in IST"""
    return datetime.now(IST)

def to_ist(dt):
    """Convert datetime to IST for display"""
    if dt is None:
        return None
    if dt.tzinfo is None:
        # Assume UTC if naive
        dt = pytz.utc.localize(dt)
    return dt.astimezone(IST)

app = Flask(__name__)
app.config.from_pyfile('config.py')

# MongoDB Setup
client = MongoClient(app.config['MONGO_URI'])
db = client.expense_tracker
expenses = db.expenses
savings = db.savings

# Register API blueprint for offline sync
from api import api, init_api
init_api(expenses, savings)
app.register_blueprint(api)

# Ensure static folder exists for charts
os.makedirs('static', exist_ok=True)


def start_of_month(dt: datetime) -> datetime:
    return datetime(dt.year, dt.month, 1)

def start_of_next_month(dt: datetime) -> datetime:
    # if month is December, roll to January of next year
    if dt.month == 12:
        return datetime(dt.year + 1, 1, 1)
    return datetime(dt.year, dt.month + 1, 1)

def generate_chart(collection, group_field, chart_name):
    pipeline = [
        {"$addFields": {
            "month": {"$month": "$date"},
            "year": {"$year": "$date"}
        }},
        {"$group": {"_id": f"${group_field}", "total": {"$sum": "$amount"}}}
    ]
    result = list(collection.aggregate(pipeline))
    
    if not result:
        plt.figure()
        plt.text(0.5, 0.5, "No Data", ha='center', va='center', fontsize=16)
        plt.savefig(f'static/{chart_name}.png')
        plt.close()
        return

    categories = [r['_id'] for r in result]
    totals = [r['total'] for r in result]

    plt.figure(figsize=(8, 4))
    plt.bar(categories, totals)
    plt.xticks(rotation=45)
    plt.tight_layout()

    plt.savefig(f'static/{chart_name}.png')
    plt.close()

def generate_pie_chart(collection, group_field, chart_name, query=None):
    pipeline = []
    
    # Add $match stage if query exists
    if query:
        pipeline.append({"$match": query})

    # Group by field and sum amount
    pipeline.append({
        "$group": {"_id": f"${group_field}", "total": {"$sum": "$amount"}}
    })

    result = list(collection.aggregate(pipeline))

    if not result:
        plt.figure()
        plt.text(0.5, 0.5, "No Data", ha='center', va='center', fontsize=16)
        plt.savefig(f'static/{chart_name}.png')
        plt.close()
        return

    labels = [r['_id'] for r in result]
    sizes = [r['total'] for r in result]
    total = sum(sizes)

    plt.figure(figsize=(8, 6))
    plt.pie(
        sizes,
        labels=[f"{l} - ₹{s:.2f} ({s/total*100:.1f}%)" for l, s in zip(labels, sizes)],
        autopct='%1.1f%%',
        startangle=140,
        textprops={'fontsize': 14}  # 👈 Increased font size here
    )
    plt.axis('equal')  # Equal aspect ratio ensures circle
    plt.title(f"Total: ₹{total:.2f}", fontsize=16)  # Optional: Increase title size
    plt.tight_layout()

    plt.savefig(f'static/{chart_name}.png')
    plt.close()
    
@app.route('/')
def index():
    return render_template('index.html')

# @app.route('/')
# def index():
#     return render_template('base.html')

# === EXPENSES ===
@app.route('/add_expense', methods=['GET', 'POST'])
def add_expense():
    current_date = get_ist_now().strftime('%Y-%m-%d')
    if request.method == 'POST':
        try:
            amount = float(request.form['amount'])
            category = request.form['category']
            payment_mode = request.form['payment_mode']
            date = datetime.strptime(request.form['date'], '%Y-%m-%d')
            time = request.form.get('time', '').strip()

            # If no time is provided, use current IST time
            if not time:
                time = get_ist_now().strftime('%H:%M')

            note = request.form.get('note', '')

            data = {
                'amount': amount,
                'category': category,
                'payment_mode': payment_mode,
                'date': date,
                'time': time,
                'note': note
            }

            expenses.insert_one(data)
            flash('Expense added successfully!', 'success')
            return redirect(url_for('add_expense'))

        except Exception as e:
            flash(f'Error adding expense: {str(e)}', 'error')
            return redirect(url_for('add_expense'))

    return render_template('add_expense.html', current_date=current_date)


@app.route('/edit_expense/<id>', methods=['GET', 'POST'])
def edit_expense(id):
    exp = expenses.find_one({'_id': ObjectId(id)})
    exp['date_str'] = exp['date'].strftime('%Y-%m-%d')
    current_date = get_ist_now().strftime('%Y-%m-%d')

    if request.method == 'POST':
        try:
            updated = {
                'amount': float(request.form['amount']),
                'category': request.form['category'],
                'payment_mode': request.form['payment_mode'],
                'date': datetime.strptime(request.form['date'], '%Y-%m-%d'),
                'time': request.form.get('time', ''),
                'note': request.form.get('note', '')
            }
            expenses.update_one({'_id': ObjectId(id)}, {'$set': updated})
            flash('Expense updated successfully!', 'success')
            return redirect(url_for('expense_report'))
        except Exception as e:
            flash(f'Error updating expense: {str(e)}', 'error')
            return redirect(url_for('edit_expense', id=id))

    return render_template('edit_expense.html', expense=exp, current_date=current_date)

@app.route('/delete_expense/<id>')
def delete_expense(id):
    try:
        expenses.delete_one({'_id': ObjectId(id)})
        flash('Expense deleted successfully!', 'success')
    except Exception as e:
        flash(f'Error deleting expense: {str(e)}', 'error')
    return redirect(url_for('expense_report'))


# @app.route('/expense_report')
# def expense_report():
#     all_expenses = list(expenses.find().sort('date', -1))
#     generate_chart(expenses, 'category', 'expense_chart')
#     return render_template('expense_report.html', expenses=all_expenses, chart='expense_chart.png')

@app.route('/expense_report')
def expense_report():
    query = {}

    month = request.args.get('month')
    year = request.args.get('year')
    category = request.args.get('category')
    payment_mode = request.args.get('payment_mode')
    from_date = request.args.get('from_date')
    to_date = request.args.get('to_date')

    # Build year list for dropdown (last 5 years)
    current_year = get_ist_now().year
    years_list = list(range(current_year, current_year - 5, -1))

    # Default year to current if month selected but year not specified
    if month and not year:
        year = str(current_year)

    # Month + Year filter
    if month:
        try:
            month_num = datetime.strptime(month, '%B').month
            selected_year = int(year) if year else current_year
            start = datetime(selected_year, month_num, 1)
            if month_num == 12:
                next_start = datetime(selected_year + 1, 1, 1)
            else:
                next_start = datetime(selected_year, month_num + 1, 1)
            query['date'] = {'$gte': start, '$lt': next_start}
        except ValueError:
            pass

    # Date range filter (overrides month filter if both provided)
    if from_date and to_date:
        query['date'] = {
            '$gte': datetime.strptime(from_date, '%Y-%m-%d'),
            '$lte': datetime.strptime(to_date, '%Y-%m-%d')
        }

    if category:
        query['category'] = category

    if payment_mode:
        query['payment_mode'] = payment_mode

    # Fetch filtered expenses
    filtered_expenses = list(expenses.find(query).sort([("date", -1), ("time", -1)]))
    total_filtered = sum(e['amount'] for e in filtered_expenses)

    categories = expenses.distinct('category')
    payment_modes = expenses.distinct('payment_mode')

    # Generate pie chart with filtered query
    generate_pie_chart(expenses, 'category', 'expense_chart', query)

    # Calculate current month total
    now = get_ist_now()
    current_month = now.strftime('%B')
    start = datetime(now.year, now.month, 1)
    next_start = start_of_next_month(now)
    current_month_query = {'date': {'$gte': start, '$lt': next_start}}
    current_month_total = sum(e['amount'] for e in expenses.find(current_month_query))

    return render_template(
        'expense_report.html',
        expenses=filtered_expenses,
        chart='expense_chart.png',
        categories=categories,
        payment_modes=payment_modes,
        current_month=current_month,
        current_month_total=current_month_total,
        total_filtered=total_filtered,
        years_list=years_list,
        selected_year=year
    )

# === SAVINGS ===
@app.route('/add_saving', methods=['GET', 'POST'])
def add_saving():
    current_date = get_ist_now().strftime('%Y-%m-%d')
    if request.method == 'POST':
        try:
            amount = float(request.form['amount'])
            saving_mode = request.form['saving_mode']
            date = datetime.strptime(request.form['date'], '%Y-%m-%d')
            time = request.form.get('time', '').strip()
            if not time:
                time = get_ist_now().strftime('%H:%M')
            note = request.form.get('note', '')

            data = {
                'amount': amount,
                'saving_mode': saving_mode,
                'date': date,
                'time': time,
                'note': note
            }

            savings.insert_one(data)
            flash('Saving added successfully!', 'success')
            return redirect(url_for('saving_report'))
        except Exception as e:
            flash(f'Error adding saving: {str(e)}', 'error')
            return redirect(url_for('add_saving'))

    return render_template('add_saving.html', current_date=current_date)


@app.route('/edit_saving/<id>', methods=['GET', 'POST'])
def edit_saving(id):
    saving = savings.find_one({'_id': ObjectId(id)})
    
    if request.method == 'POST':
        try:
            updated = {
                'amount': float(request.form['amount']),
                'saving_mode': request.form['saving_mode'],
                'date': datetime.strptime(request.form['date'], '%Y-%m-%d'),
                'time': request.form.get('time', ''),
                'note': request.form.get('note', '')
            }
            savings.update_one({'_id': ObjectId(id)}, {'$set': updated})
            flash('Saving updated successfully!', 'success')
            return redirect(url_for('saving_report'))
        except Exception as e:
            flash(f'Error updating saving: {str(e)}', 'error')
            return redirect(url_for('edit_saving', id=id))

    saving['date_str'] = saving['date'].strftime('%Y-%m-%d')
    return render_template('edit_saving.html', saving=saving)

@app.route('/delete_saving/<id>')
def delete_saving(id):
    try:
        savings.delete_one({'_id': ObjectId(id)})
        flash('Saving deleted successfully!', 'success')
    except Exception as e:
        flash(f'Error deleting saving: {str(e)}', 'error')
    return redirect(url_for('saving_report'))


@app.route('/saving_report')
def saving_report():
    query = {}

    month = request.args.get('month')
    year = request.args.get('year')
    mode = request.args.get('saving_mode')
    from_date = request.args.get('from_date')
    to_date = request.args.get('to_date')

    # Build year list for dropdown (last 5 years)
    current_year = get_ist_now().year
    years_list = list(range(current_year, current_year - 5, -1))

    # Default year to current if month selected but year not specified
    if month and not year:
        year = str(current_year)

    # Month + Year filter
    if month:
        try:
            month_num = datetime.strptime(month, '%B').month
            selected_year = int(year) if year else current_year
            start = datetime(selected_year, month_num, 1)
            if month_num == 12:
                next_start = datetime(selected_year + 1, 1, 1)
            else:
                next_start = datetime(selected_year, month_num + 1, 1)
            query['date'] = {'$gte': start, '$lt': next_start}
        except ValueError:
            pass

    # Date range filter (overrides month filter if both provided)
    if from_date and to_date:
        query['date'] = {
            '$gte': datetime.strptime(from_date, '%Y-%m-%d'),
            '$lte': datetime.strptime(to_date, '%Y-%m-%d')
        }

    if mode:
        query['saving_mode'] = mode

    # Fetch filtered savings
    filtered_savings = list(savings.find(query).sort([("date", -1), ("time", -1)]))
    total_filtered = sum(e['amount'] for e in filtered_savings)

    modes = savings.distinct('saving_mode')

    # Generate pie chart with filtered query
    generate_pie_chart(savings, 'saving_mode', 'saving_chart', query)

    # Calculate current month total
    now = get_ist_now()
    current_month = now.strftime('%B')
    start = datetime(now.year, now.month, 1)
    next_start = start_of_next_month(now)
    current_month_query = {'date': {'$gte': start, '$lt': next_start}}

    current_month_total = sum(e['amount'] for e in savings.find(current_month_query))
    total_saved = sum(e['amount'] for e in savings.find())

    return render_template(
        'saving_report.html',
        savings=filtered_savings,
        chart='saving_chart.png',
        modes=modes,
        current_month=current_month,
        current_month_total=current_month_total,
        total_filtered=total_filtered,
        total_saved=total_saved,
        years_list=years_list,
        selected_year=year
    )


# @app.route('/')
# def index():
#     return render_template('index.html')
# === EXPORT ===
@app.route('/export/<type>')
def export_data(type):
    collection = expenses if type == 'expense' else savings
    cursor = collection.find()
    df = pd.DataFrame(list(cursor))
    df.drop('_id', axis=1, inplace=True)
    buf = BytesIO()
    with pd.ExcelWriter(buf, engine='openpyxl') as writer:
        df.to_excel(writer, index=False)
    buf.seek(0)
    return send_file(buf, download_name=f'{type}s.xlsx', as_attachment=True)

if __name__ == '__main__':
    app.run(debug=True)
