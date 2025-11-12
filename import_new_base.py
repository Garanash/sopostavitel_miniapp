#!/usr/bin/env python3
"""
Скрипт для импорта данных из файла 'База данных соответствий.xlsx'
в таблицу product_mappings
"""

import asyncio
import sys
from pathlib import Path
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import delete
from database import ProductMapping, Base
from config import Config
import openpyxl

async def clear_mappings(session: AsyncSession):
    """Удаление всех записей из таблицы product_mappings"""
    print("Очистка таблицы product_mappings...")
    await session.execute(delete(ProductMapping))
    await session.commit()
    print("✅ Таблица очищена")

async def import_excel_data(session: AsyncSession, file_path: str):
    """Импорт данных из Excel файла"""
    print(f"Чтение файла: {file_path}")
    
    wb = openpyxl.load_workbook(file_path, data_only=True)
    ws = wb.active
    
    print(f"Размер таблицы: {ws.max_row} строк, {ws.max_column} колонок")
    
    # Находим заголовки
    headers = []
    header_row = None
    
    for row_idx, row in enumerate(ws.iter_rows(max_row=20), start=1):
        row_values = [cell.value for cell in row if cell.value]
        if len(row_values) >= 2:
            # Проверяем, есть ли известные заголовки
            row_lower = [str(v).lower() if v else '' for v in row_values]
            if any(keyword in ' '.join(row_lower) for keyword in ['код', 'code', '1с', 'bortlanger', 'epiroc', 'almazgeobur']):
                headers = row_values
                header_row = row_idx
                print(f"Найдены заголовки в строке {row_idx}: {headers[:10]}")
                break
    
    if not headers:
        # Если заголовки не найдены, используем первую строку
        headers = [cell.value for cell in ws[1] if cell.value]
        header_row = 1
        print(f"Используем первую строку как заголовки: {headers[:10]}")
    
    # Определяем индексы колонок
    header_lower = [str(h).lower() if h else '' for h in headers]
    
    code_1c_idx = None
    bortlanger_idx = None
    epiroc_idx = None
    almazgeobur_idx = None
    competitor_indices = {}
    
    for idx, header in enumerate(header_lower):
        header_str = str(header).strip()
        if 'код' in header_str and '1с' in header_str:
            code_1c_idx = idx
        elif 'bortlanger' in header_str or 'бортлангер' in header_str:
            bortlanger_idx = idx
        elif 'epiroc' in header_str or 'эпирок' in header_str:
            epiroc_idx = idx
        elif 'almazgeobur' in header_str or 'алмазгеобур' in header_str:
            almazgeobur_idx = idx
        else:
            # Остальные колонки - конкуренты
            if header_str and header_str not in ['id', 'действия', 'action']:
                competitor_indices[idx] = header_str
    
    print(f"Индексы колонок:")
    print(f"  code_1c: {code_1c_idx}")
    print(f"  bortlanger: {bortlanger_idx}")
    print(f"  epiroc: {epiroc_idx}")
    print(f"  almazgeobur: {almazgeobur_idx}")
    print(f"  конкурентов: {len(competitor_indices)}")
    
    # Импортируем данные
    imported = 0
    skipped = 0
    
    for row_idx, row in enumerate(ws.iter_rows(min_row=header_row + 1), start=header_row + 1):
        row_values = [cell.value for cell in row]
        
        # Пропускаем пустые строки
        if not any(row_values):
            continue
        
        # Извлекаем значения
        code_1c = str(row_values[code_1c_idx]).strip() if code_1c_idx is not None and code_1c_idx < len(row_values) and row_values[code_1c_idx] else None
        bortlanger = str(row_values[bortlanger_idx]).strip() if bortlanger_idx is not None and bortlanger_idx < len(row_values) and row_values[bortlanger_idx] else None
        epiroc = str(row_values[epiroc_idx]).strip() if epiroc_idx is not None and epiroc_idx < len(row_values) and row_values[epiroc_idx] else None
        almazgeobur = str(row_values[almazgeobur_idx]).strip() if almazgeobur_idx is not None and almazgeobur_idx < len(row_values) and row_values[almazgeobur_idx] else None
        
        # Очищаем значения
        if code_1c and (code_1c.lower() == 'none' or code_1c == '-' or code_1c == ''):
            code_1c = None
        if bortlanger and (bortlanger.lower() == 'none' or bortlanger == '-' or bortlanger == ''):
            bortlanger = None
        if epiroc and (epiroc.lower() == 'none' or epiroc == '-' or epiroc == ''):
            epiroc = None
        if almazgeobur and (almazgeobur.lower() == 'none' or almazgeobur == '-' or almazgeobur == ''):
            almazgeobur = None
        
        # Собираем конкурентов
        competitors = {}
        for idx, name in competitor_indices.items():
            if idx < len(row_values) and row_values[idx]:
                value = str(row_values[idx]).strip()
                if value and value.lower() not in ['none', '-', '']:
                    competitors[name] = value
        
        # Пропускаем полностью пустые строки
        if not any([code_1c, bortlanger, epiroc, almazgeobur, competitors]):
            skipped += 1
            continue
        
        # Создаем запись
        mapping = ProductMapping(
            code_1c=code_1c,
            bortlanger=bortlanger,
            epiroc=epiroc,
            almazgeobur=almazgeobur,
            competitors=competitors if competitors else None
        )
        
        session.add(mapping)
        imported += 1
        
        # Коммитим батчами
        if imported % 1000 == 0:
            await session.commit()
            print(f"Импортировано: {imported} записей...")
    
    await session.commit()
    print(f"\n✅ Импорт завершен!")
    print(f"   Импортировано: {imported} записей")
    print(f"   Пропущено: {skipped} пустых строк")

async def main():
    """Основная функция"""
    file_path = Path("База данных соответствий.xlsx")
    
    if not file_path.exists():
        print(f"❌ Файл не найден: {file_path}")
        sys.exit(1)
    
    # Подключаемся к БД
    engine = create_async_engine(Config.DATABASE_URL, echo=False)
    async_session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session_maker() as session:
        # Очищаем таблицу
        await clear_mappings(session)
        
        # Импортируем данные
        await import_excel_data(session, str(file_path))
    
    await engine.dispose()
    print("\n✅ Готово!")

if __name__ == "__main__":
    asyncio.run(main())

