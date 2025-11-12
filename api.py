from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
import json

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
    code_1c: Optional[str] = None
    bortlanger: Optional[str] = None
    epiroc: Optional[str] = None
    almazgeobur: Optional[str] = None
    competitors: Optional[dict] = None

class ProductMappingResponse(BaseModel):
    id: int
    code_1c: Optional[str]
    bortlanger: Optional[str]
    epiroc: Optional[str]
    almazgeobur: Optional[str]
    competitors: Optional[dict]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class ProductMappingSearchResponse(BaseModel):
    mapping: ProductMappingResponse
    match_score: float
    matched_fields: List[str]

def calculate_similarity(text1: str, text2: str) -> float:
    """Вычисляет процент совпадения между двумя строками"""
    if not text1 or not text2:
        return 0.0
    return SequenceMatcher(None, text1.lower(), text2.lower()).ratio() * 100

@app.post("/api/mappings", response_model=ProductMappingResponse)
async def create_mapping(mapping: ProductMappingCreate, db: AsyncSession = Depends(get_db)):
    """Создание новой строки в таблице сопоставления"""
    db_mapping = ProductMapping(
        code_1c=mapping.code_1c,
        bortlanger=mapping.bortlanger,
        epiroc=mapping.epiroc,
        almazgeobur=mapping.almazgeobur,
        competitors=mapping.competitors or {}
    )
    db.add(db_mapping)
    await db.commit()
    await db.refresh(db_mapping)
    return db_mapping

@app.get("/api/mappings", response_model=List[ProductMappingResponse])
async def get_mappings(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    """Получение всех строк таблицы"""
    result = await db.execute(select(ProductMapping).offset(skip).limit(limit))
    return result.scalars().all()

@app.get("/api/mappings/search", response_model=List[ProductMappingSearchResponse])
async def search_mappings(
    query: str = Query(..., description="Поисковый запрос"),
    min_score: float = Query(50.0, description="Минимальный процент совпадения"),
    limit: int = Query(20, description="Максимальное количество результатов"),
    db: AsyncSession = Depends(get_db)
):
    """Поиск строк с процентом совпадения"""
    result = await db.execute(select(ProductMapping))
    all_mappings = result.scalars().all()
    
    search_results = []
    query_lower = query.lower()
    
    for mapping in all_mappings:
        scores = []
        matched_fields = []
        
        # Проверяем все поля
        fields_to_check = {
            'code_1c': mapping.code_1c,
            'bortlanger': mapping.bortlanger,
            'epiroc': mapping.epiroc,
            'almazgeobur': mapping.almazgeobur,
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

@app.get("/api/mappings/search", response_model=List[ProductMappingSearchResponse])
async def search_mappings(
    query: str = Query(..., description="Поисковый запрос"),
    min_score: float = Query(50.0, description="Минимальный процент совпадения"),
    limit: int = Query(20, description="Максимальное количество результатов"),
    db: AsyncSession = Depends(get_db)
):
    """Поиск строк с процентом совпадения"""
    result = await db.execute(select(ProductMapping))
    all_mappings = result.scalars().all()
    
    search_results = []
    query_lower = query.lower()
    
    for mapping in all_mappings:
        scores = []
        matched_fields = []
        
        # Проверяем все поля
        fields_to_check = {
            'code_1c': mapping.code_1c,
            'bortlanger': mapping.bortlanger,
            'epiroc': mapping.epiroc,
            'almazgeobur': mapping.almazgeobur,
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

@app.post("/api/mappings/upload")
async def upload_mapping_file(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """Загрузка файла с распознаванием и добавлением строк в таблицу"""
    try:
        # Сохраняем файл
        file_bytes = await file.read()
        file_path = await file_processor.save_file(file_bytes, file.filename)
        
        # Извлекаем текст
        extracted_text = await file_processor.process_file(file_path, file.content_type)
        
        if not extracted_text.strip():
            raise HTTPException(status_code=400, detail="Не удалось извлечь текст из файла")
        
        # Парсим текст как CSV или таблицу
        # Простой парсер для CSV/таблицы
        lines = extracted_text.split('\n')
        headers = None
        created_count = 0
        
        for i, line in enumerate(lines):
            line = line.strip()
            if not line:
                continue
            
            # Разделяем по табуляции или запятой
            if '\t' in line:
                parts = [p.strip() for p in line.split('\t')]
            else:
                parts = [p.strip() for p in line.split(',')]
            
            if i == 0:
                # Первая строка - заголовки
                headers = [h.lower().strip() for h in parts]
                continue
            
            if len(parts) < 2:
                continue
            
            # Создаем mapping из строки
            mapping_data = {}
            competitors = {}
            
            for j, value in enumerate(parts):
                if j >= len(headers):
                    break
                
                header = headers[j]
                if not value:
                    continue
                
                # Определяем тип поля
                if 'код' in header and '1с' in header:
                    mapping_data['code_1c'] = value
                elif 'bortlanger' in header.lower():
                    mapping_data['bortlanger'] = value
                elif 'epiroc' in header.lower():
                    mapping_data['epiroc'] = value
                elif 'almazgeobur' in header.lower() or 'алмазгеобур' in header.lower():
                    mapping_data['almazgeobur'] = value
                elif 'конкурент' in header.lower() or 'competitor' in header.lower():
                    competitors[header] = value
                else:
                    # Неизвестное поле - добавляем как конкурента
                    competitors[header] = value
            
            if competitors:
                mapping_data['competitors'] = competitors
            
            # Создаем запись в базе
            if mapping_data:
                db_mapping = ProductMapping(**mapping_data)
                db.add(db_mapping)
                created_count += 1
        
        await db.commit()
        
        return {
            "message": f"Успешно добавлено {created_count} строк",
            "created_count": created_count
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка при обработке файла: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

