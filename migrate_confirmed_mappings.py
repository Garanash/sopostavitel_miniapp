import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy import text
from database import Base, ConfirmedMapping
from config import Config

async def migrate_db():
    """
    Миграция базы данных: создает таблицу confirmed_mappings
    """
    engine = create_async_engine(Config.DATABASE_URL, echo=False)
    
    async with engine.begin() as conn:
        # Создаем таблицу confirmed_mappings
        await conn.run_sync(Base.metadata.create_all)
        print("✅ Таблица confirmed_mappings создана")
    
    await engine.dispose()

if __name__ == "__main__":
    print("🔄 Начинаю миграцию БД для confirmed_mappings...")
    asyncio.run(migrate_db())
    print("✅ Миграция завершена")

