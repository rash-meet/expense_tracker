# config.py
import os

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/expense_tracker")
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key")