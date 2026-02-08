# app.py

# Set non-interactive backend FIRST (before any matplotlib/pyplot import)
import matplotlib
matplotlib.use('Agg')  # 👈 Important! Must be before importing pyplot
import matplotlib.pyplot as plt

from dotenv import load_dotenv
load_dotenv()

from flask import Flask, render_template, request, redirect, url_for, send_file, flash
from flask_cors import CORS
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

# Enable CORS for frontend origin
frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
CORS(app, resources={
    r"/api/*": {
        "origins": [frontend_url, "http://localhost:3000"],
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"],
        "supports_credentials": True
    }
})

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
    """Redirect root to the Vercel frontend - Flask serves only API"""
    return redirect(frontend_url)

# @app.route('/')
# def index():
#     return render_template('base.html')

# === EXPENSES - Redirects to Vercel frontend ===
@app.route('/add_expense', methods=['GET', 'POST'])
def add_expense():
    return redirect(f"{frontend_url}/expenses/add")

@app.route('/edit_expense/<id>', methods=['GET', 'POST'])
def edit_expense(id):
    return redirect(f"{frontend_url}/expenses/edit/{id}")

@app.route('/delete_expense/<id>')
def delete_expense(id):
    return redirect(f"{frontend_url}/expenses")

@app.route('/expense_report')
def expense_report():
    return redirect(f"{frontend_url}/expenses")



# === SAVINGS - Redirects to Vercel frontend ===
@app.route('/add_saving', methods=['GET', 'POST'])
def add_saving():
    return redirect(f"{frontend_url}/savings/add")

@app.route('/edit_saving/<id>', methods=['GET', 'POST'])
def edit_saving(id):
    return redirect(f"{frontend_url}/savings/edit/{id}")

@app.route('/delete_saving/<id>')
def delete_saving(id):
    return redirect(f"{frontend_url}/savings")

@app.route('/saving_report')
def saving_report():
    return redirect(f"{frontend_url}/savings")


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
