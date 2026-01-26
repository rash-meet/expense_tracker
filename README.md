# Expense Tracker - Separate Frontend & Backend

A personal expense and savings tracker with **separate frontend and backend deployments** for improved availability.

## 🏗️ Architecture

```
┌─────────────────────────┐     ┌─────────────────────────┐
│   Vercel (Frontend)     │────▶│   Render (Backend)      │
│   Next.js App           │     │   Flask API             │
│   Always Available      │     │   Free Tier (sleeps)    │
└─────────────────────────┘     └─────────────────────────┘
         │                                   │
         ▼                                   ▼
   ┌───────────┐                    ┌───────────────┐
   │ IndexedDB │                    │ MongoDB Atlas │
   │ (Offline) │                    │   (Database)  │
   └───────────┘                    └───────────────┘
```

## ✨ Features

- **🔐 JWT Authentication**: 4-hour session expiry, credentials in backend .env
- **📱 Offline Mode**: Works while backend wakes up using cached data
- **🔄 Auto Sync**: Queue operations offline, sync when connected
- **🌙 Dark Theme**: Beautiful modern dark UI
- **📊 Reports**: Filter by category, payment mode, date range

## 🚀 Quick Start

### Backend (Flask API)

```bash
# Install dependencies
pip install -r requirements.txt

# Set environment variables in .env
MONGO_URI=your_mongodb_uri
AUTH_USERNAME=your_username
AUTH_PASSWORD=your_secure_password
JWT_SECRET=your_jwt_secret
FRONTEND_URL=http://localhost:3000

# Run
python app.py
```

### Frontend (Next.js)

```bash
cd frontend

# Install dependencies
npm install

# Set API URL in .env.local
NEXT_PUBLIC_API_URL=http://localhost:5000

# Run
npm run dev
```

## 📦 Deployment

### Backend → Render

1. Create a new Web Service on [Render](https://render.com)
2. Connect your GitHub repo
3. Set environment variables:
   - `MONGO_URI`
   - `AUTH_USERNAME`
   - `AUTH_PASSWORD`
   - `JWT_SECRET`
   - `FRONTEND_URL` (your Vercel URL)
4. Deploy

### Frontend → Vercel

1. Create a new project on [Vercel](https://vercel.com)
2. Import the `frontend/` directory
3. Set environment variable:
   - `NEXT_PUBLIC_API_URL` = your Render backend URL
4. Deploy

## 🔑 Authentication

Login credentials are set in the backend's `.env` file:

```env
AUTH_USERNAME=admin
AUTH_PASSWORD=your_secure_password
```

Sessions expire after **4 hours** of inactivity.

## 📁 Project Structure

```
expense_tracker/
├── app.py              # Flask backend
├── api.py              # REST API with JWT auth
├── config.py           # Backend config
├── requirements.txt    # Python dependencies
├── .env                # Backend secrets (not in git)
│
└── frontend/           # Next.js frontend
    ├── src/
    │   ├── app/        # Pages (login, expenses, savings)
    │   ├── components/ # React components
    │   ├── lib/        # API client, auth, offline
    │   └── types/      # TypeScript interfaces
    └── .env.local      # Frontend config (not in git)
```

## 🔧 API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/login` | ❌ | Login, get JWT token |
| GET | `/api/health` | ❌ | Health check |
| GET | `/api/verify` | ✅ | Verify token |
| GET | `/api/expenses` | ✅ | List expenses |
| POST | `/api/expenses` | ✅ | Add expense |
| PUT | `/api/expenses/:id` | ✅ | Update expense |
| DELETE | `/api/expenses/:id` | ✅ | Delete expense |
| GET | `/api/savings` | ✅ | List savings |
| POST | `/api/savings` | ✅ | Add saving |
| PUT | `/api/savings/:id` | ✅ | Update saving |
| DELETE | `/api/savings/:id` | ✅ | Delete saving |
| GET | `/api/stats` | ✅ | Get statistics |
| POST | `/api/sync` | ✅ | Bulk sync |

## 🔒 Security Notes

- JWT tokens are stored in localStorage (expires in 4 hours)
- Passwords are NOT hashed (single-user app with .env credentials)
- CORS is configured to only allow your frontend origin
- For production, use HTTPS for both frontend and backend
