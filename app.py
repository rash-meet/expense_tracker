# app.py

# Set non-interactive backend FIRST (before any matplotlib/pyplot import)
import matplotlib
matplotlib.use('Agg')  # 👈 Important! Must be before importing pyplot
import matplotlib.pyplot as plt

from flask import Flask, render_template, request, redirect, url_for, send_file
from pymongo import MongoClient
from bson.objectid import ObjectId
import pandas as pd
from io import BytesIO
import os
from datetime import datetime

app = Flask(__name__)
app.config.from_pyfile('config.py')

# MongoDB Setup
client = MongoClient(app.config['MONGO_URI'])
db = client.expense_tracker
expenses = db.expenses
savings = db.savings

# Ensure static folder exists for charts
os.makedirs('static', exist_ok=True)

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
    current_date = datetime.now().strftime('%Y-%m-%d')
    if request.method == 'POST':
        amount = float(request.form['amount'])
        category = request.form['category']
        payment_mode = request.form['payment_mode']
        date = datetime.strptime(request.form['date'], '%Y-%m-%d')
        time = request.form.get('time', '').strip()  # Get and clean time input

        # If no time is provided, use current system time
        if not time:
            time = datetime.now().strftime('%H:%M')  # Format as HH:MM

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
        return redirect(url_for('index'))

    return render_template('add_expense.html', current_date=current_date)

@app.route('/edit_expense/<id>', methods=['GET', 'POST'])
def edit_expense(id):
    exp = expenses.find_one({'_id': ObjectId(id)})
    exp['date_str'] = exp['date'].strftime('%Y-%m-%d')
    current_date = datetime.now().strftime('%Y-%m-%d')

    if request.method == 'POST':
        updated = {
            'amount': float(request.form['amount']),
            'category': request.form['category'],
            'payment_mode': request.form['payment_mode'],
            'date': datetime.strptime(request.form['date'], '%Y-%m-%d'),
            'time': request.form.get('time', ''),
            'note': request.form.get('note', '')
        }
        expenses.update_one({'_id': ObjectId(id)}, {'$set': updated})
        return redirect(url_for('index'))

    return render_template('edit_expense.html', expense=exp, current_date=current_date)

@app.route('/delete_expense/<id>')
def delete_expense(id):
    expenses.delete_one({'_id': ObjectId(id)})
    return redirect(url_for('index'))

# @app.route('/expense_report')
# def expense_report():
#     all_expenses = list(expenses.find().sort('date', -1))
#     generate_chart(expenses, 'category', 'expense_chart')
#     return render_template('expense_report.html', expenses=all_expenses, chart='expense_chart.png')

# 
@app.route('/expense_report')
def expense_report():
    from datetime import datetime

    query = {}

    month = request.args.get('month')
    category = request.args.get('category')
    from_date = request.args.get('from_date')
    to_date = request.args.get('to_date')

    # Build query dynamically
    if month:
        try:
            month_num = datetime.strptime(month, '%B').month
            query['date'] = {
                '$gte': datetime(datetime.now().year, month_num, 1),
                '$lt': datetime(datetime.now().year, month_num + 1, 1)
            }
        except ValueError:
            pass

    if from_date and to_date:
        query['date'] = {
            '$gte': datetime.strptime(from_date, '%Y-%m-%d'),
            '$lte': datetime.strptime(to_date, '%Y-%m-%d')
        }

    if category:
        query['category'] = category

    # Fetch filtered expenses
    filtered_expenses = list(expenses.find(query).sort([("date", -1), ("time", -1)]))
    total_filtered = sum(e['amount'] for e in filtered_expenses)

    categories = expenses.distinct('category')

    # Generate pie chart with filtered query
    generate_pie_chart(expenses, 'category', 'expense_chart', query)

    # Calculate current month total
    current_month = datetime.now().strftime('%B')
    current_month_query = {
        'date': {
            '$gte': datetime(datetime.now().year, datetime.now().month, 1),
            '$lt': datetime(datetime.now().year, datetime.now().month + 1, 1)
        }
    }
    current_month_total = sum(e['amount'] for e in expenses.find(current_month_query))

    return render_template(
        'expense_report.html',
        expenses=filtered_expenses,
        chart='expense_chart.png',
        categories=categories,
        current_month=current_month,
        current_month_total=current_month_total,
        total_filtered=total_filtered
    )
# === SAVINGS ===
@app.route('/add_saving', methods=['GET', 'POST'])
def add_saving():
    current_date = datetime.now().strftime('%Y-%m-%d')
    if request.method == 'POST':
        amount = float(request.form['amount'])
        saving_mode = request.form['saving_mode']
        date = datetime.strptime(request.form['date'], '%Y-%m-%d')
        note = request.form.get('note', '')

        data = {
            'amount': amount,
            'saving_mode': saving_mode,
            'date': date,
            'note': note
        }

        savings.insert_one(data)
        return redirect(url_for('index'))

    return render_template('add_saving.html', current_date=current_date)


@app.route('/edit_saving/<id>', methods=['GET', 'POST'])
def edit_saving(id):
    from bson.objectid import ObjectId
    saving = savings.find_one({'_id': ObjectId(id)})
    
    if request.method == 'POST':
        updated = {
            'amount': float(request.form['amount']),
            'saving_mode': request.form['saving_mode'],
            'date': datetime.strptime(request.form['date'], '%Y-%m-%d'),
            'note': request.form.get('note', '')
        }
        savings.update_one({'_id': ObjectId(id)}, {'$set': updated})
        return redirect(url_for('index'))

    saving['date_str'] = saving['date'].strftime('%Y-%m-%d')
    return render_template('edit_saving.html', saving=saving)

@app.route('/delete_saving/<id>')
def delete_saving(id):
    savings.delete_one({'_id': ObjectId(id)})
    return redirect(url_for('index'))
@app.route('/saving_report')
def saving_report():
    from datetime import datetime

    query = {}

    month = request.args.get('month')
    mode = request.args.get('saving_mode')
    from_date = request.args.get('from_date')
    to_date = request.args.get('to_date')

    # Build query dynamically
    if month:
        try:
            month_num = datetime.strptime(month, '%B').month
            query['date'] = {
                '$gte': datetime(datetime.now().year, month_num, 1),
                '$lt': datetime(datetime.now().year, month_num + 1, 1)
            }
        except ValueError:
            pass

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
    current_month = datetime.now().strftime('%B')
    current_month_query = {
        'date': {
            '$gte': datetime(datetime.now().year, datetime.now().month, 1),
            '$lt': datetime(datetime.now().year, datetime.now().month + 1, 1)
        }
    }
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
        total_saved=total_saved
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