# config.py
import os

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/expense_tracker")
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key")

# Authentication
AUTH_USERNAME = os.getenv("AUTH_USERNAME", "admin")
AUTH_PASSWORD = os.getenv("AUTH_PASSWORD", "changeme")
JWT_SECRET = os.getenv("JWT_SECRET", "jwt-secret-key-change-in-production")

# CORS - Frontend URL for cross-origin requests
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")