#!/usr/bin/env python3
"""
Скрипт миграции БД для добавления новых полей в таблицу product_mappings
"""
import asyncio
import sys
from sqlalchemy import text
from database import engine, async_session_maker
from config import Config

async def migrate():
    """Добавление новых колонок в таблицу product_mappings"""
    print("🔄 Начинаю миграцию БД...")
    
    async with engine.begin() as conn:
        # Проверяем, какие колонки уже существуют
        result = await conn.execute(text("PRAGMA table_info(product_mappings)"))
        existing_columns = {row[1] for row in result.fetchall()}
        
        print(f"Существующие колонки: {existing_columns}")
        
        # Список новых колонок для добавления
        new_columns = {
            'article_bl': 'VARCHAR',
            'article_agb': 'VARCHAR',
            'variant_1': 'VARCHAR',
            'variant_2': 'VARCHAR',
            'variant_3': 'VARCHAR',
            'variant_4': 'VARCHAR',
            'variant_5': 'VARCHAR',
            'variant_6': 'VARCHAR',
            'variant_7': 'VARCHAR',
            'variant_8': 'VARCHAR',
            'unit': 'VARCHAR',
            'code': 'VARCHAR',
            'nomenclature_agb': 'VARCHAR',
            'packaging': 'VARCHAR'
        }
        
        added_count = 0
        for col_name, col_type in new_columns.items():
            if col_name not in existing_columns:
                try:
                    await conn.execute(text(f"ALTER TABLE product_mappings ADD COLUMN {col_name} {col_type}"))
                    print(f"✅ Добавлена колонка: {col_name}")
                    added_count += 1
                except Exception as e:
                    print(f"⚠️ Ошибка при добавлении колонки {col_name}: {e}")
            else:
                print(f"ℹ️ Колонка {col_name} уже существует, пропускаю")
        
        if added_count == 0:
            print("✅ Все колонки уже существуют, миграция не требуется")
        else:
            print(f"✅ Миграция завершена. Добавлено колонок: {added_count}")
    
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(migrate())

