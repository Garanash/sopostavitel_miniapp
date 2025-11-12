"""
Скрипт для импорта базы данных Epiroc из Excel файла
"""
import asyncio
import openpyxl
from database import init_db, async_session_maker, ProductMapping
from config import Config

async def import_epiroc_base(file_path: str):
    """Импорт базы данных Epiroc из Excel файла"""
    await init_db()
    
    wb = openpyxl.load_workbook(file_path)
    ws = wb.active
    
    # Читаем заголовки
    headers = []
    for cell in ws[1]:
        headers.append(cell.value if cell.value else f"col_{cell.column_letter}")
    
    print(f"Найдено колонок: {len(headers)}")
    print(f"Заголовки: {headers[:10]}...")
    
    # Определяем индексы колонок
    code_1c_idx = None
    bortlanger_idx = None
    epiroc_idx = None
    almazgeobur_idx = None
    
    for i, header in enumerate(headers):
        header_lower = str(header).lower() if header else ""
        if 'код' in header_lower and '1с' in header_lower:
            code_1c_idx = i
        elif 'bortlanger' in header_lower or 'бортлангер' in header_lower:
            bortlanger_idx = i
        elif 'epiroc' in header_lower or 'эпирок' in header_lower:
            epiroc_idx = i
        elif 'almazgeobur' in header_lower or 'алмазгеобур' in header_lower:
            almazgeobur_idx = i
    
    print(f"\nИндексы колонок:")
    print(f"  Код 1С: {code_1c_idx}")
    print(f"  Bortlanger: {bortlanger_idx}")
    print(f"  Epiroc: {epiroc_idx}")
    print(f"  Almazgeobur: {almazgeobur_idx}")
    
    # Собираем конкурентов (все остальные колонки)
    competitor_indices = {}
    for i, header in enumerate(headers):
        if i not in [code_1c_idx, bortlanger_idx, epiroc_idx, almazgeobur_idx]:
            if header and str(header).strip():
                competitor_indices[i] = str(header).strip()
    
    print(f"\nКонкуренты: {list(competitor_indices.values())[:10]}...")
    
    # Импортируем данные
    async with async_session_maker() as session:
        imported_count = 0
        skipped_count = 0
        
        for row_idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
            # Пропускаем пустые строки
            if not any(row):
                continue
            
            # Извлекаем значения
            code_1c = str(row[code_1c_idx]).strip() if code_1c_idx is not None and row[code_1c_idx] else None
            bortlanger = str(row[bortlanger_idx]).strip() if bortlanger_idx is not None and row[bortlanger_idx] else None
            epiroc = str(row[epiroc_idx]).strip() if epiroc_idx is not None and row[epiroc_idx] else None
            almazgeobur = str(row[almazgeobur_idx]).strip() if almazgeobur_idx is not None and row[almazgeobur_idx] else None
            
            # Проверяем, что есть хотя бы одно значение
            if not any([code_1c, bortlanger, epiroc, almazgeobur]):
                skipped_count += 1
                continue
            
            # Собираем конкурентов
            competitors = {}
            for idx, name in competitor_indices.items():
                if idx < len(row) and row[idx]:
                    value = str(row[idx]).strip()
                    if value and value != 'None':
                        competitors[name] = value
            
            # Создаем запись
            mapping = ProductMapping(
                code_1c=code_1c if code_1c and code_1c != 'None' else None,
                bortlanger=bortlanger if bortlanger and bortlanger != 'None' else None,
                epiroc=epiroc if epiroc and epiroc != 'None' else None,
                almazgeobur=almazgeobur if almazgeobur and almazgeobur != 'None' else None,
                competitors=competitors if competitors else None
            )
            
            session.add(mapping)
            imported_count += 1
            
            # Коммитим каждые 100 записей
            if imported_count % 100 == 0:
                await session.commit()
                print(f"Импортировано {imported_count} записей...")
        
        # Финальный коммит
        await session.commit()
        
        print(f"\n✅ Импорт завершен!")
        print(f"   Импортировано: {imported_count} записей")
        print(f"   Пропущено: {skipped_count} пустых строк")

if __name__ == "__main__":
    file_path = "База по заказчика Epiroc.xlsx"
    asyncio.run(import_epiroc_base(file_path))

