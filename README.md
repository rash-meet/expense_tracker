# 💰 Expense Tracker

A modern, offline-first expense and savings tracker built with Flask and MongoDB. Features a dark-themed UI, PWA support, and works even when your backend is asleep (perfect for Render's free tier).

![Python](https://img.shields.io/badge/Python-3.9+-blue)
![Flask](https://img.shields.io/badge/Flask-2.3+-green)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-brightgreen)
![License](https://img.shields.io/badge/License-MIT-yellow)

## ✨ Features

- **📊 Track Expenses & Savings** - Categorize by type, payment mode, and notes
- **📈 Visual Reports** - Pie charts and filterable tables
- **🔍 Search & Filter** - By month, year, category, payment mode, date range
- **🌙 Dark Theme** - Easy on the eyes
- **📱 Mobile Responsive** - Works on all devices
- **🔔 Toast Notifications** - Success/error feedback
- **⏰ IST Timezone** - All times in Indian Standard Time
- **📡 Offline-First PWA** - Works without internet, syncs when connected
- **🟢 Connection Status** - Real-time backend connectivity indicator

## 🚀 Quick Start

### Prerequisites
- Python 3.9+
- MongoDB Atlas account (or local MongoDB)

### Installation

```bash
# Clone the repository
git clone https://github.com/rash-meet/expense_tracker.git
cd expense_tracker

# Create virtual environment
python -m venv myenv
.\myenv\Scripts\Activate.ps1  # Windows
# source myenv/bin/activate   # Linux/Mac

# Install dependencies
pip install -r requirements.txt

# Create .env file
echo "MONGO_URI=your_mongodb_connection_string" > .env
echo "SECRET_KEY=your_secret_key" >> .env

# Run the app
python app.py
```

Visit `http://127.0.0.1:5000`

## 📁 Project Structure

```
expense_tracker/
├── app.py              # Main Flask application
├── api.py              # REST API for offline sync
├── config.py           # Configuration settings
├── requirements.txt    # Python dependencies
├── .env                # Environment variables (not in git)
├── static/
│   ├── manifest.json   # PWA manifest
│   ├── sw.js           # Service worker
│   ├── offline.js      # IndexedDB & sync queue
│   └── style.css       # Custom styles
└── templates/
    ├── base.html           # Base template with navbar
    ├── index.html          # Home page
    ├── add_expense.html    # Add expense form
    ├── add_saving.html     # Add saving form
    ├── expense_report.html # Expense reports
    └── saving_report.html  # Savings reports
```

## 🔧 Configuration

Create a `.env` file with:

```env
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority
SECRET_KEY=your-super-secret-key
```

## 📡 Offline Mode

The app works offline using:
- **Service Worker** - Caches pages and static assets
- **IndexedDB** - Stores data locally
- **Sync Queue** - Queues changes when offline, syncs when online

Perfect for Render's free tier where backends sleep after inactivity!

## 🛠️ API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Check backend connectivity |
| `/api/expenses` | GET | Fetch expenses |
| `/api/expenses` | POST | Add expense |
| `/api/savings` | GET | Fetch savings |
| `/api/savings` | POST | Add saving |
| `/api/sync` | POST | Bulk sync queued items |

## 🚢 Deployment (Render)

1. Push to GitHub
2. Create new Web Service on Render
3. Connect your repo
4. Set environment variables (`MONGO_URI`, `SECRET_KEY`)
5. Deploy!


## 🙏 Contributing

PRs welcome! Please open an issue first to discuss changes.
