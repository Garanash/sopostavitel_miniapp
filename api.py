from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, StreamingResponse
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Dict
from pydantic import BaseModel
from datetime import datetime
import json
import openpyxl
from io import BytesIO
import tempfile
import os
import uuid

from database import get_db, Article, ProcessedFile, MatchedArticle, ProductMapping, init_db
from file_processor import FileProcessor
from config import Config
from difflib import SequenceMatcher

app = FastAPI(title="Article Matcher API", version="1.0.0")

# CORS настройки
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # В продакшене указать конкретные домены
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

file_processor = FileProcessor()

# Pydantic модели
class ArticleCreate(BaseModel):
    article_number: str
    name: str
    description: Optional[str] = None
    price: Optional[float] = None
    category: Optional[str] = None

class ArticleResponse(BaseModel):
    id: int
    article_number: str
    name: str
    description: Optional[str]
    price: Optional[float]
    category: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True

class MatchedArticleResponse(BaseModel):
    id: int
    article_id: int
    article_number: str
    article_name: str
    found_text: str
    confidence: float
    created_at: datetime
    
    class Config:
        from_attributes = True

class ProcessedFileResponse(BaseModel):
    id: int
    user_id: int
    file_name: str
    file_type: str
    status: str
    matched_articles: List[MatchedArticleResponse]
    created_at: datetime
    
    class Config:
        from_attributes = True

# API Endpoints

@app.on_event("startup")
async def startup_event():
    """Инициализация при запуске"""
    await init_db()

@app.get("/")
async def root():
    """Корневой endpoint"""
    return {"message": "Article Matcher API", "version": "1.0.0"}

@app.get("/api/articles", response_model=List[ArticleResponse])
async def get_articles(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """Получение списка артикулов"""
    query = select(Article)
    
    if search:
        query = query.where(
            Article.article_number.contains(search) |
            Article.name.contains(search)
        )
    
    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    articles = result.scalars().all()
    return articles

@app.post("/api/articles", response_model=ArticleResponse)
async def create_article(
    article: ArticleCreate,
    db: AsyncSession = Depends(get_db)
):
    """Создание нового артикула"""
    # Проверка на дубликат
    existing = await db.execute(
        select(Article).where(Article.article_number == article.article_number)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Артикул уже существует")
    
    db_article = Article(**article.dict())
    db.add(db_article)
    await db.commit()
    await db.refresh(db_article)
    return db_article

@app.get("/api/articles/{article_id}", response_model=ArticleResponse)
async def get_article(article_id: int, db: AsyncSession = Depends(get_db)):
    """Получение артикула по ID"""
    result = await db.execute(select(Article).where(Article.id == article_id))
    article = result.scalar_one_or_none()
    if not article:
        raise HTTPException(status_code=404, detail="Артикул не найден")
    return article

@app.delete("/api/articles/{article_id}")
async def delete_article(article_id: int, db: AsyncSession = Depends(get_db)):
    """Удаление артикула"""
    result = await db.execute(select(Article).where(Article.id == article_id))
    article = result.scalar_one_or_none()
    if not article:
        raise HTTPException(status_code=404, detail="Артикул не найден")
    
    await db.delete(article)
    await db.commit()
    return {"message": "Артикул удален"}

@app.post("/api/files/upload")
async def upload_file(
    file: UploadFile = File(...),
    user_id: int = Query(...),
    db: AsyncSession = Depends(get_db)
):
    """Загрузка и обработка файла"""
    try:
        # Проверка типа файла
        if file.content_type not in Config.SUPPORTED_IMAGE_TYPES + Config.SUPPORTED_DOCUMENT_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Неподдерживаемый тип файла: {file.content_type}"
            )
        
        # Чтение файла
        file_bytes = await file.read()
        
        if len(file_bytes) > Config.MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail="Файл слишком большой")
        
        # Сохранение файла
        file_path = await file_processor.save_file(file_bytes, file.filename)
        
        # Создание записи в БД
        processed_file = ProcessedFile(
            user_id=user_id,
            file_name=file.filename,
            file_type=file.content_type,
            file_path=file_path,
            status="processing"
        )
        db.add(processed_file)
        await db.commit()
        await db.refresh(processed_file)
        
        # Извлечение текста
        extracted_text = await file_processor.process_file(file_path, file.content_type)
        
        # Получение артикулов из базы
        result = await db.execute(select(Article))
        articles = result.scalars().all()
        article_numbers = [article.article_number for article in articles]
        
        # Поиск совпадений
        matches = file_processor.extract_article_numbers(extracted_text, article_numbers)
        
        # Обновление записи
        processed_file.extracted_text = extracted_text[:10000]
        processed_file.matched_articles = json.dumps(matches, ensure_ascii=False)
        processed_file.status = "completed"
        
        # Сохранение деталей совпадений
        for match in matches:
            article_result = await db.execute(
                select(Article).where(Article.article_number == match["article"])
            )
            article = article_result.scalar_one_or_none()
            
            if article:
                matched_article = MatchedArticle(
                    processed_file_id=processed_file.id,
                    article_id=article.id,
                    found_text=match["found_text"],
                    confidence=match["confidence"]
                )
                db.add(matched_article)
        
        await db.commit()
        await db.refresh(processed_file)
        
        return {
            "id": processed_file.id,
            "status": "completed",
            "matches_count": len(matches),
            "matches": matches[:20]  # Первые 20 совпадений
        }
        
    except Exception as e:
        # Обновляем статус на ошибку
        if 'processed_file' in locals():
            processed_file.status = "error"
            await db.commit()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/files", response_model=List[ProcessedFileResponse])
async def get_files(
    user_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db)
):
    """Получение списка обработанных файлов"""
    query = select(ProcessedFile)
    
    if user_id:
        query = query.where(ProcessedFile.user_id == user_id)
    
    query = query.order_by(ProcessedFile.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    files = result.scalars().all()
    
    # Загружаем совпадения для каждого файла
    response = []
    for file in files:
        matches_result = await db.execute(
            select(MatchedArticle, Article)
            .join(Article, MatchedArticle.article_id == Article.id)
            .where(MatchedArticle.processed_file_id == file.id)
        )
        matches = matches_result.all()
        
        matched_articles = []
        for matched, article in matches:
            matched_articles.append(MatchedArticleResponse(
                id=matched.id,
                article_id=article.id,
                article_number=article.article_number,
                article_name=article.name,
                found_text=matched.found_text,
                confidence=matched.confidence,
                created_at=matched.created_at
            ))
        
        response.append(ProcessedFileResponse(
            id=file.id,
            user_id=file.user_id,
            file_name=file.file_name,
            file_type=file.file_type,
            status=file.status,
            matched_articles=matched_articles,
            created_at=file.created_at
        ))
    
    return response

@app.get("/api/files/{file_id}", response_model=ProcessedFileResponse)
async def get_file(file_id: int, db: AsyncSession = Depends(get_db)):
    """Получение деталей обработанного файла"""
    result = await db.execute(select(ProcessedFile).where(ProcessedFile.id == file_id))
    file = result.scalar_one_or_none()
    
    if not file:
        raise HTTPException(status_code=404, detail="Файл не найден")
    
    # Загружаем совпадения
    matches_result = await db.execute(
        select(MatchedArticle, Article)
        .join(Article, MatchedArticle.article_id == Article.id)
        .where(MatchedArticle.processed_file_id == file_id)
    )
    matches = matches_result.all()
    
    matched_articles = []
    for matched, article in matches:
        matched_articles.append(MatchedArticleResponse(
            id=matched.id,
            article_id=article.id,
            article_number=article.article_number,
            article_name=article.name,
            found_text=matched.found_text,
            confidence=matched.confidence,
            created_at=matched.created_at
        ))
    
    return ProcessedFileResponse(
        id=file.id,
        user_id=file.user_id,
        file_name=file.file_name,
        file_type=file.file_type,
        status=file.status,
        matched_articles=matched_articles,
        created_at=file.created_at
    )

@app.get("/api/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    """Получение статистики"""
    articles_count = await db.scalar(select(func.count(Article.id)))
    files_count = await db.scalar(select(func.count(ProcessedFile.id)))
    matches_count = await db.scalar(select(func.count(MatchedArticle.id)))
    
    return {
        "articles_count": articles_count,
        "files_count": files_count,
        "matches_count": matches_count
    }

# ========== API для работы с таблицей сопоставления ==========

class ProductMappingCreate(BaseModel):
    # Старые поля (для совместимости)
    code_1c: Optional[str] = None
    bortlanger: Optional[str] = None
    epiroc: Optional[str] = None
    almazgeobur: Optional[str] = None
    competitors: Optional[dict] = None
    
    # Новые базовые поля
    article_bl: Optional[str] = None  # артикул bl
    article_agb: Optional[str] = None  # артикул агб
    variant_1: Optional[str] = None  # вариант подбора 1
    variant_2: Optional[str] = None  # вариант подбора 2
    variant_3: Optional[str] = None  # вариант подбора 3
    variant_4: Optional[str] = None  # вариант подбора 4
    variant_5: Optional[str] = None  # вариант подбора 5
    variant_6: Optional[str] = None  # вариант подбора 6
    variant_7: Optional[str] = None  # вариант подбора 7
    variant_8: Optional[str] = None  # вариант подбора 8
    unit: Optional[str] = None  # ед.изм.
    code: Optional[str] = None  # код
    nomenclature_agb: Optional[str] = None  # номенклатура агб
    packaging: Optional[str] = None  # фасовка для химии, кг.

class ProductMappingResponse(BaseModel):
    id: int
    # Старые поля (для совместимости)
    code_1c: Optional[str]
    bortlanger: Optional[str]
    epiroc: Optional[str]
    almazgeobur: Optional[str]
    competitors: Optional[dict]
    
    # Новые базовые поля
    article_bl: Optional[str]
    article_agb: Optional[str]
    variant_1: Optional[str]
    variant_2: Optional[str]
    variant_3: Optional[str]
    variant_4: Optional[str]
    variant_5: Optional[str]
    variant_6: Optional[str]
    variant_7: Optional[str]
    variant_8: Optional[str]
    unit: Optional[str]
    code: Optional[str]
    nomenclature_agb: Optional[str]
    packaging: Optional[str]
    
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class ProductMappingSearchResponse(BaseModel):
    mapping: ProductMappingResponse
    match_score: float
    matched_fields: List[str]

def calculate_similarity(text1: str, text2: str) -> float:
    """Вычисляет процент совпадения между двумя строками на основе совпадения слов"""
    if not text1 or not text2:
        return 0.0
    
    # Нормализуем тексты: приводим к нижнему регистру и разбиваем на слова
    import re
    words1 = set(re.findall(r'\w+', text1.lower()))
    words2 = set(re.findall(r'\w+', text2.lower()))
    
    if not words1 or not words2:
        return 0.0
    
    # Находим точные совпадения слов
    exact_matches = words1.intersection(words2)
    
    # Если есть точные совпадения, считаем процент на их основе
    if exact_matches:
        # Процент = (количество совпавших слов / количество слов в запросе) * 100
        # Но также учитываем, сколько слов из текста совпало
        match_ratio = len(exact_matches) / len(words1)
        # Дополнительный бонус, если все слова запроса найдены
        if len(exact_matches) == len(words1):
            match_ratio = 1.0
        return match_ratio * 100
    
    # Если нет точных совпадений, используем частичное совпадение
    # Проверяем, содержит ли текст2 слова из text1 (частичное совпадение)
    partial_score = 0.0
    for word1 in words1:
        for word2 in words2:
            if word1 in word2 or word2 in word1:
                partial_score += 0.5  # Частичное совпадение дает 50% от полного
                break
    
    if partial_score > 0:
        return (partial_score / len(words1)) * 100
    
    # Если нет даже частичных совпадений, используем SequenceMatcher как fallback
    return SequenceMatcher(None, text1.lower(), text2.lower()).ratio() * 100

@app.post("/api/mappings", response_model=ProductMappingResponse)
async def create_mapping(mapping: ProductMappingCreate, db: AsyncSession = Depends(get_db)):
    """Создание новой строки в таблице сопоставления"""
    db_mapping = ProductMapping(
        # Старые поля
        code_1c=mapping.code_1c,
        bortlanger=mapping.bortlanger,
        epiroc=mapping.epiroc,
        almazgeobur=mapping.almazgeobur,
        competitors=mapping.competitors or {},
        # Новые базовые поля
        article_bl=mapping.article_bl,
        article_agb=mapping.article_agb,
        variant_1=mapping.variant_1,
        variant_2=mapping.variant_2,
        variant_3=mapping.variant_3,
        variant_4=mapping.variant_4,
        variant_5=mapping.variant_5,
        variant_6=mapping.variant_6,
        variant_7=mapping.variant_7,
        variant_8=mapping.variant_8,
        unit=mapping.unit,
        code=mapping.code,
        nomenclature_agb=mapping.nomenclature_agb,
        packaging=mapping.packaging
    )
    db.add(db_mapping)
    await db.commit()
    await db.refresh(db_mapping)
    return db_mapping

@app.get("/api/mappings")
async def get_mappings(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db)
):
    """Получение всех строк таблицы с пагинацией"""
    # Получаем общее количество записей
    count_result = await db.execute(select(func.count(ProductMapping.id)))
    total = count_result.scalar()
    
    # Получаем данные с пагинацией
    result = await db.execute(
        select(ProductMapping)
        .order_by(ProductMapping.id)
        .offset(skip)
        .limit(limit)
    )
    mappings = result.scalars().all()
    
    return {
        "items": [ProductMappingResponse.model_validate(m) for m in mappings],
        "total": total,
        "skip": skip,
        "limit": limit
    }

@app.get("/api/mappings/search", response_model=List[ProductMappingSearchResponse])
async def search_mappings(
    query: str = Query(..., description="Поисковый запрос"),
    min_score: float = Query(50.0, description="Минимальный процент совпадения"),
    limit: int = Query(20, description="Максимальное количество результатов"),
    db: AsyncSession = Depends(get_db)
):
    """Поиск строк с процентом совпадения на основе совпадения слов"""
    result = await db.execute(select(ProductMapping))
    all_mappings = result.scalars().all()
    
    search_results = []
    
    for mapping in all_mappings:
        scores = []
        matched_fields = []
        
        # Проверяем все поля (старые и новые)
        fields_to_check = {
            'code_1c': mapping.code_1c,
            'bortlanger': mapping.bortlanger,
            'epiroc': mapping.epiroc,
            'almazgeobur': mapping.almazgeobur,
            # Новые базовые поля
            'article_bl': mapping.article_bl,
            'article_agb': mapping.article_agb,
            'variant_1': mapping.variant_1,
            'variant_2': mapping.variant_2,
            'variant_3': mapping.variant_3,
            'variant_4': mapping.variant_4,
            'variant_5': mapping.variant_5,
            'variant_6': mapping.variant_6,
            'variant_7': mapping.variant_7,
            'variant_8': mapping.variant_8,
            'unit': mapping.unit,
            'code': mapping.code,
            'nomenclature_agb': mapping.nomenclature_agb,
            'packaging': mapping.packaging,
        }
        
        # Проверяем конкурентов
        if mapping.competitors:
            for comp_name, comp_value in mapping.competitors.items():
                if comp_value:
                    fields_to_check[comp_name] = comp_value
        
        for field_name, field_value in fields_to_check.items():
            if field_value:
                score = calculate_similarity(query, str(field_value))
                if score > 0:
                    scores.append(score)
                    if score >= min_score:
                        matched_fields.append(field_name)
        
        if scores:
            max_score = max(scores)
            if max_score >= min_score:
                search_results.append({
                    'mapping': mapping,
                    'match_score': round(max_score, 2),
                    'matched_fields': matched_fields
                })
    
    # Сортируем по проценту совпадения (по убыванию)
    search_results.sort(key=lambda x: x['match_score'], reverse=True)
    
    # Ограничиваем количество результатов
    search_results = search_results[:limit]
    
    return [
        ProductMappingSearchResponse(
            mapping=ProductMappingResponse.model_validate(item['mapping']),
            match_score=item['match_score'],
            matched_fields=item['matched_fields']
        )
        for item in search_results
    ]

@app.get("/api/mappings/{mapping_id}", response_model=ProductMappingResponse)
async def get_mapping(mapping_id: int, db: AsyncSession = Depends(get_db)):
    """Получение конкретной строки"""
    result = await db.execute(select(ProductMapping).where(ProductMapping.id == mapping_id))
    mapping = result.scalar_one_or_none()
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")
    return mapping

@app.put("/api/mappings/{mapping_id}", response_model=ProductMappingResponse)
async def update_mapping(
    mapping_id: int,
    mapping: ProductMappingCreate,
    db: AsyncSession = Depends(get_db)
):
    """Обновление строки таблицы"""
    result = await db.execute(select(ProductMapping).where(ProductMapping.id == mapping_id))
    db_mapping = result.scalar_one_or_none()
    if not db_mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")
    
    # Обновляем старые поля
    if mapping.code_1c is not None:
        db_mapping.code_1c = mapping.code_1c
    if mapping.bortlanger is not None:
        db_mapping.bortlanger = mapping.bortlanger
    if mapping.epiroc is not None:
        db_mapping.epiroc = mapping.epiroc
    if mapping.almazgeobur is not None:
        db_mapping.almazgeobur = mapping.almazgeobur
    if mapping.competitors is not None:
        db_mapping.competitors = mapping.competitors
    
    # Обновляем новые базовые поля
    if mapping.article_bl is not None:
        db_mapping.article_bl = mapping.article_bl
    if mapping.article_agb is not None:
        db_mapping.article_agb = mapping.article_agb
    if mapping.variant_1 is not None:
        db_mapping.variant_1 = mapping.variant_1
    if mapping.variant_2 is not None:
        db_mapping.variant_2 = mapping.variant_2
    if mapping.variant_3 is not None:
        db_mapping.variant_3 = mapping.variant_3
    if mapping.variant_4 is not None:
        db_mapping.variant_4 = mapping.variant_4
    if mapping.variant_5 is not None:
        db_mapping.variant_5 = mapping.variant_5
    if mapping.variant_6 is not None:
        db_mapping.variant_6 = mapping.variant_6
    if mapping.variant_7 is not None:
        db_mapping.variant_7 = mapping.variant_7
    if mapping.variant_8 is not None:
        db_mapping.variant_8 = mapping.variant_8
    if mapping.unit is not None:
        db_mapping.unit = mapping.unit
    if mapping.code is not None:
        db_mapping.code = mapping.code
    if mapping.nomenclature_agb is not None:
        db_mapping.nomenclature_agb = mapping.nomenclature_agb
    if mapping.packaging is not None:
        db_mapping.packaging = mapping.packaging
    
    await db.commit()
    await db.refresh(db_mapping)
    return db_mapping

@app.delete("/api/mappings/{mapping_id}")
async def delete_mapping(mapping_id: int, db: AsyncSession = Depends(get_db)):
    """Удаление строки таблицы"""
    result = await db.execute(select(ProductMapping).where(ProductMapping.id == mapping_id))
    mapping = result.scalar_one_or_none()
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")
    await db.delete(mapping)
    await db.commit()
    return {"message": "Mapping deleted"}

@app.post("/api/mappings/upload")
async def upload_mapping_file(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """Загрузка файла с распознаванием и сопоставлением с таблицей соответствий"""
    try:
        # Сохраняем файл
        file_bytes = await file.read()
        file_path = await file_processor.save_file(file_bytes, file.filename)
        
        # Извлекаем текст
        extracted_text = await file_processor.process_file(file_path, file.content_type)
        
        if not extracted_text.strip():
            raise HTTPException(status_code=400, detail="Не удалось извлечь текст из файла")
        
        # Получаем все записи из таблицы соответствий
        result = await db.execute(select(ProductMapping))
        all_mappings = result.scalars().all()
        
        # Разбиваем текст на строки (артикулы/названия)
        lines = [line.strip() for line in extracted_text.split('\n') if line.strip()]
        
        # Результаты распознавания и сопоставления
        recognition_results = []
        
        # Для каждой строки ищем совпадения
        for line in lines:
            if not line or len(line) < 2:
                continue
            
            best_match = None
            best_score = 0.0
            
            # Ищем совпадения во всех полях таблицы
            for mapping in all_mappings:
                # Проверяем все поля
                fields_to_check = [
                    ('article_bl', mapping.article_bl),
                    ('article_agb', mapping.article_agb),
                    ('variant_1', mapping.variant_1),
                    ('variant_2', mapping.variant_2),
                    ('variant_3', mapping.variant_3),
                    ('variant_4', mapping.variant_4),
                    ('variant_5', mapping.variant_5),
                    ('variant_6', mapping.variant_6),
                    ('variant_7', mapping.variant_7),
                    ('variant_8', mapping.variant_8),
                    ('code', mapping.code),
                    ('nomenclature_agb', mapping.nomenclature_agb),
                ]
                
                for field_name, field_value in fields_to_check:
                    if field_value:
                        score = calculate_similarity(line, str(field_value))
                        if score > best_score:
                            best_score = score
                            best_match = {
                                'recognized_text': line,
                                'mapping_id': mapping.id,
                                'match_score': round(score, 2),
                                'matched_field': field_name,
                                'matched_value': field_value,
                                'mapping': {
                                    'id': mapping.id,
                                    'article_bl': mapping.article_bl,
                                    'article_agb': mapping.article_agb,
                                    'variant_1': mapping.variant_1,
                                    'variant_2': mapping.variant_2,
                                    'variant_3': mapping.variant_3,
                                    'variant_4': mapping.variant_4,
                                    'variant_5': mapping.variant_5,
                                    'variant_6': mapping.variant_6,
                                    'variant_7': mapping.variant_7,
                                    'variant_8': mapping.variant_8,
                                    'unit': mapping.unit,
                                    'code': mapping.code,
                                    'nomenclature_agb': mapping.nomenclature_agb,
                                    'packaging': mapping.packaging,
                                }
                            }
            
            # Добавляем только если совпадение > 95%
            if best_match and best_match['match_score'] >= 95.0:
                recognition_results.append(best_match)
            elif best_match:
                # Добавляем даже если < 95%, но с пометкой
                recognition_results.append(best_match)
        
        # Сохраняем результаты в сессию (можно использовать Redis или БД)
        # Пока сохраняем в файл временно
        session_id = str(uuid.uuid4())
        results_file = os.path.join(Config.TEMP_DIR, f"results_{session_id}.json")
        os.makedirs(Config.TEMP_DIR, exist_ok=True)
        with open(results_file, 'w', encoding='utf-8') as f:
            json.dump(recognition_results, f, ensure_ascii=False, indent=2)
        
        return {
            "message": f"Обработано {len(lines)} строк, найдено {len(recognition_results)} совпадений",
            "recognized_count": len(lines),
            "matches_count": len(recognition_results),
            "results": recognition_results[:50],  # Первые 50 результатов
            "session_id": session_id
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Ошибка при обработке файла: {str(e)}")

@app.get("/api/mappings/upload/export/{session_id}")
async def export_recognition_results(session_id: str):
    """Выгрузка результатов распознавания в Excel"""
    try:
        results_file = os.path.join(Config.TEMP_DIR, f"results_{session_id}.json")
        
        if not os.path.exists(results_file):
            raise HTTPException(status_code=404, detail="Результаты не найдены")
        
        # Загружаем результаты
        with open(results_file, 'r', encoding='utf-8') as f:
            results = json.load(f)
        
        # Создаем Excel файл
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Результаты распознавания"
        
        # Заголовки
        headers = [
            'Распознанный текст',
            'ID соответствия',
            'Процент совпадения',
            'Поле совпадения',
            'Значение совпадения',
            'Артикул BL',
            'Артикул АГБ',
            'Вариант подбора 1',
            'Вариант подбора 2',
            'Вариант подбора 3',
            'Вариант подбора 4',
            'Вариант подбора 5',
            'Вариант подбора 6',
            'Вариант подбора 7',
            'Вариант подбора 8',
            'Ед.изм.',
            'Код',
            'Номенклатура АГБ',
            'Фасовка для химии, кг.'
        ]
        
        ws.append(headers)
        
        # Данные
        for result in results:
            mapping = result.get('mapping', {})
            row = [
                result.get('recognized_text', ''),
                result.get('mapping_id', ''),
                result.get('match_score', 0),
                result.get('matched_field', ''),
                result.get('matched_value', ''),
                mapping.get('article_bl', ''),
                mapping.get('article_agb', ''),
                mapping.get('variant_1', ''),
                mapping.get('variant_2', ''),
                mapping.get('variant_3', ''),
                mapping.get('variant_4', ''),
                mapping.get('variant_5', ''),
                mapping.get('variant_6', ''),
                mapping.get('variant_7', ''),
                mapping.get('variant_8', ''),
                mapping.get('unit', ''),
                mapping.get('code', ''),
                mapping.get('nomenclature_agb', ''),
                mapping.get('packaging', ''),
            ]
            ws.append(row)
        
        # Сохраняем во временный файл
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx')
        temp_file_path = temp_file.name
        temp_file.close()
        wb.save(temp_file_path)
        
        # Используем StreamingResponse для отправки файла
        def generate():
            with open(temp_file_path, 'rb') as f:
                while True:
                    chunk = f.read(8192)
                    if not chunk:
                        break
                    yield chunk
            # Удаляем файл после отправки
            try:
                os.unlink(temp_file_path)
            except:
                pass
        
        return StreamingResponse(
            generate(),
            media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            headers={"Content-Disposition": f"attachment; filename=results_{session_id}.xlsx"}
        )
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Ошибка при выгрузке: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

