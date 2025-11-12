from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy import Column, Integer, String, DateTime, Text, Float, JSON
from datetime import datetime
from config import Config

Base = declarative_base()

class Article(Base):
    """Модель артикула из нашей базы"""
    __tablename__ = "articles"
    
    id = Column(Integer, primary_key=True, index=True)
    article_number = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    price = Column(Float, nullable=True)
    category = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class ProcessedFile(Base):
    """Модель обработанных файлов"""
    __tablename__ = "processed_files"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    file_name = Column(String, nullable=False)
    file_type = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    extracted_text = Column(Text, nullable=True)
    matched_articles = Column(Text, nullable=True)  # JSON string
    status = Column(String, default="pending")  # pending, processing, completed, error
    created_at = Column(DateTime, default=datetime.utcnow)

class MatchedArticle(Base):
    """Модель сопоставленных артикулов"""
    __tablename__ = "matched_articles"
    
    id = Column(Integer, primary_key=True, index=True)
    processed_file_id = Column(Integer, nullable=False, index=True)
    article_id = Column(Integer, nullable=False, index=True)
    found_text = Column(String, nullable=False)  # Текст, в котором найден артикул
    confidence = Column(Float, nullable=True)  # Уровень уверенности в совпадении
    created_at = Column(DateTime, default=datetime.utcnow)

class ProductMapping(Base):
    """Модель таблицы сопоставления артикулов"""
    __tablename__ = "product_mappings"
    
    id = Column(Integer, primary_key=True, index=True)
    code_1c = Column(String, nullable=True, index=True)  # Код 1С
    bortlanger = Column(String, nullable=True)
    epiroc = Column(String, nullable=True)
    almazgeobur = Column(String, nullable=True)
    competitors = Column(JSON, nullable=True)  # JSON объект с конкурентами {"конкурент1": "123", "конкурент2": "456", ...}
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

# Создание движка и сессии
engine = create_async_engine(Config.DATABASE_URL, echo=True)
async_session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def init_db():
    """Инициализация базы данных"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

async def get_db():
    """Получение сессии базы данных (для FastAPI Depends)"""
    async with async_session_maker() as session:
        try:
            yield session
        finally:
            await session.close()

