"""
Скрипт для инициализации базы данных с примерами артикулов
"""
import asyncio
from database import init_db, async_session_maker, Article

async def init_sample_data():
    """Добавление примеров артикулов в базу данных"""
    await init_db()
    
    sample_articles = [
        {
            "article_number": "ART-001",
            "name": "Товар 1",
            "description": "Описание товара 1",
            "price": 1000.00,
            "category": "Категория A"
        },
        {
            "article_number": "ART-002",
            "name": "Товар 2",
            "description": "Описание товара 2",
            "price": 2000.00,
            "category": "Категория B"
        },
        {
            "article_number": "ART-003",
            "name": "Товар 3",
            "description": "Описание товара 3",
            "price": 1500.00,
            "category": "Категория A"
        },
        {
            "article_number": "12345",
            "name": "Товар с цифровым артикулом",
            "description": "Пример товара с числовым артикулом",
            "price": 500.00,
            "category": "Категория C"
        },
        {
            "article_number": "PROD-2024-001",
            "name": "Продукт 2024",
            "description": "Новый продукт 2024 года",
            "price": 3000.00,
            "category": "Категория B"
        },
    ]
    
    async with async_session_maker() as session:
        # Проверяем, есть ли уже артикулы
        from sqlalchemy import select
        result = await session.execute(select(Article))
        existing = result.scalars().all()
        
        if existing:
            print(f"В базе уже есть {len(existing)} артикулов. Пропускаем добавление примеров.")
            return
        
        # Добавляем примеры
        for article_data in sample_articles:
            article = Article(**article_data)
            session.add(article)
        
        await session.commit()
        print(f"Добавлено {len(sample_articles)} примеров артикулов в базу данных.")

if __name__ == "__main__":
    asyncio.run(init_sample_data())

