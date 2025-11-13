import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    # Telegram Bot
    TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
    
    # Database
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./data/database.db")
    
    # Web App
    WEB_APP_URL = os.getenv("WEB_APP_URL", "http://localhost:3000")
    API_URL = os.getenv("API_URL", "http://localhost:8000")
    
    # OCR Settings
    OCR_LANGUAGE = os.getenv("OCR_LANGUAGE", "rus+eng")
    TESSERACT_CMD = os.getenv("TESSERACT_CMD", "/opt/homebrew/bin/tesseract")
    
    # File Upload Settings
    MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB
    UPLOAD_DIR = "uploads"
    TEMP_DIR = "temp"
    
    # Supported file types
    SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/jpg"]
    SUPPORTED_DOCUMENT_TYPES = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",  # .xlsx
        "application/vnd.ms-excel",  # .xls
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # .docx
    ]
    
    # AI Settings
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
    OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-3.5-turbo")  # Используем недорогую модель

