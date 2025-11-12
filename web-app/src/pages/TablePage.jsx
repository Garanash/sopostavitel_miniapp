import React, { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { useDropzone } from 'react-dropzone'
import './TablePage.css'

function TablePage() {
  const [mappings, setMappings] = useState([])
  const [searchResults, setSearchResults] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [minScore, setMinScore] = useState(50)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [recognitionResults, setRecognitionResults] = useState([])
  const [sessionId, setSessionId] = useState(null)
  
  // Пагинация
  const [currentPage, setCurrentPage] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const itemsPerPage = 20
  
  const [formData, setFormData] = useState({
    article_bl: '',
    article_agb: '',
    variant_1: '',
    variant_2: '',
    variant_3: '',
    variant_4: '',
    variant_5: '',
    variant_6: '',
    variant_7: '',
    variant_8: '',
    unit: '',
    code: '',
    nomenclature_agb: '',
    packaging: ''
  })

  useEffect(() => {
    console.log('TablePage mounted, loading mappings...')
    loadMappings()
  }, [currentPage])

  const loadMappings = async () => {
    try {
      setLoading(true)
      setError(null)
      const skip = (currentPage - 1) * itemsPerPage
      const response = await axios.get('/api/mappings', {
        params: {
          skip: skip,
          limit: itemsPerPage
        },
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json'
        }
      })
      
      if (response.data.items) {
        setMappings(response.data.items)
        setTotalItems(response.data.total || 0)
        console.log(`Загружено записей: ${response.data.items.length} из ${response.data.total}`)
      } else {
        setMappings(response.data)
        setTotalItems(response.data.length)
      }
    } catch (err) {
      console.error('Ошибка загрузки:', err)
      let errorMessage = 'Ошибка при загрузке таблицы'
      if (err.response) {
        errorMessage = err.response.data?.detail || err.response.statusText || errorMessage
      } else if (err.request) {
        errorMessage = 'Нет ответа от сервера. Проверьте подключение.'
      } else {
        errorMessage = err.message || errorMessage
      }
      setError(errorMessage)
      setMappings([])
      setTotalItems(0)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }

    try {
      setLoading(true)
      setError(null)
      const response = await axios.get('/api/mappings/search', {
        params: {
          query: searchQuery,
          min_score: minScore,
          limit: 50
        },
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json'
        }
      })
      setSearchResults(response.data)
      console.log('Найдено результатов:', response.data.length)
    } catch (err) {
      let errorMessage = 'Ошибка при поиске'
      if (err.response?.data) {
        if (Array.isArray(err.response.data.detail)) {
          errorMessage = err.response.data.detail.map(d => d.msg || d).join(', ')
        } else if (typeof err.response.data.detail === 'string') {
          errorMessage = err.response.data.detail
        } else if (err.response.data.detail) {
          errorMessage = JSON.stringify(err.response.data.detail)
        }
      } else if (err.message) {
        errorMessage = err.message
      }
      setError(errorMessage)
      setSearchResults([])
    } finally {
      setLoading(false)
    }
  }

  const onDrop = useCallback(async (acceptedFiles) => {
    if (acceptedFiles.length === 0) return

    const file = acceptedFiles[0]
    setUploading(true)
    setError(null)
    setRecognitionResults([])
    setSessionId(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await axios.post('/api/mappings/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 300000, // 5 минут для больших файлов
      })

      setRecognitionResults(response.data.results || [])
      setSessionId(response.data.session_id)
      
      alert(`✅ ${response.data.message}\nНайдено совпадений: ${response.data.matches_count}`)
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Ошибка при загрузке файла')
    } finally {
      setUploading(false)
    }
  }, [])

  const handleExportResults = async () => {
    if (!sessionId) {
      alert('Нет результатов для выгрузки')
      return
    }

    try {
      const response = await axios.get(`/api/mappings/upload/export/${sessionId}`, {
        responseType: 'blob',
      })

      // Создаем ссылку для скачивания
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `results_${sessionId}.xlsx`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Ошибка при выгрузке')
    }
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/pdf': ['.pdf'],
      'image/*': ['.jpg', '.jpeg', '.png']
    },
    maxSize: 20 * 1024 * 1024,
  })

  const resetForm = () => {
    setFormData({
      article_bl: '',
      article_agb: '',
      variant_1: '',
      variant_2: '',
      variant_3: '',
      variant_4: '',
      variant_5: '',
      variant_6: '',
      variant_7: '',
      variant_8: '',
      unit: '',
      code: '',
      nomenclature_agb: '',
      packaging: ''
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    // Валидация обязательных полей
    const requiredFields = ['article_bl', 'article_agb', 'variant_1', 'variant_2', 'variant_3', 
                           'variant_4', 'variant_5', 'variant_6', 'variant_7', 'variant_8', 
                           'unit', 'code', 'nomenclature_agb', 'packaging']
    const missingFields = requiredFields.filter(field => !formData[field] || formData[field].trim() === '')
    
    if (missingFields.length > 0) {
      setError(`Заполните все обязательные поля: ${missingFields.join(', ')}`)
      return
    }
    
    try {
      if (editingId) {
        // Редактирование
        await axios.put(`/api/mappings/${editingId}`, formData)
        setEditingId(null)
      } else {
        // Создание
        await axios.post('/api/mappings', formData)
      }
      setShowAddForm(false)
      resetForm()
      await loadMappings()
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Ошибка при сохранении')
    }
  }

  const handleEdit = (mapping) => {
    setFormData({
      article_bl: mapping.article_bl || '',
      article_agb: mapping.article_agb || '',
      variant_1: mapping.variant_1 || '',
      variant_2: mapping.variant_2 || '',
      variant_3: mapping.variant_3 || '',
      variant_4: mapping.variant_4 || '',
      variant_5: mapping.variant_5 || '',
      variant_6: mapping.variant_6 || '',
      variant_7: mapping.variant_7 || '',
      variant_8: mapping.variant_8 || '',
      unit: mapping.unit || '',
      code: mapping.code || '',
      nomenclature_agb: mapping.nomenclature_agb || '',
      packaging: mapping.packaging || ''
    })
    setEditingId(mapping.id)
    setShowAddForm(true)
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setShowAddForm(false)
    resetForm()
  }

  const handleDelete = async (id) => {
    if (!confirm('Удалить эту строку?')) return
    
    try {
      await axios.delete(`/api/mappings/${id}`)
      if (mappings.length === 1 && currentPage > 1) {
        setCurrentPage(currentPage - 1)
      } else {
        await loadMappings()
      }
      if (searchResults.length > 0) {
        handleSearch()
      }
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Ошибка при удалении')
    }
  }
  
  const handlePageChange = (newPage) => {
    setCurrentPage(newPage)
    setSearchQuery('')
    setSearchResults([])
  }
  
  const totalPages = Math.ceil(totalItems / itemsPerPage)

  const displayData = searchQuery.trim() ? searchResults : mappings.map(m => ({
    mapping: m,
    match_score: null,
    matched_fields: []
  }))

  return (
    <div className="table-page">
      <div className="table-controls">
        <div className="search-section">
          <div className="search-input-group">
            <input
              type="text"
              className="search-input"
              placeholder="Введите артикул для поиска..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button className="search-button" onClick={handleSearch} disabled={loading}>
              🔍 Поиск
            </button>
          </div>
          <div className="min-score-control">
            <label>Мин. совпадение: {minScore}%</label>
            <input
              type="range"
              min="0"
              max="100"
              value={minScore}
              onChange={(e) => setMinScore(parseInt(e.target.value))}
            />
          </div>
        </div>

        <div className="action-buttons">
          <button className="btn-primary" onClick={() => {
            if (showAddForm && !editingId) {
              setShowAddForm(false)
              resetForm()
            } else if (!showAddForm) {
              setShowAddForm(true)
              setEditingId(null)
              resetForm()
            }
          }}>
            ➕ Добавить строку
          </button>
        </div>
      </div>

      {error && <div className="error">❌ {error}</div>}
      {loading && <div className="loading">⏳ Загрузка данных...</div>}
      {!loading && !error && mappings.length === 0 && (
        <div className="info">ℹ️ Таблица пуста. Загрузите данные через файл или добавьте строку вручную.</div>
      )}
      {!loading && !error && !searchQuery.trim() && totalItems > 0 && (
        <div className="info">
          ✅ Показано {mappings.length} из {totalItems} записей (страница {currentPage} из {Math.ceil(totalItems / itemsPerPage)})
        </div>
      )}

      {showAddForm && (
        <div className="add-form">
          <h3>{editingId ? 'Редактировать строку' : 'Добавить новую строку'}</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-row">
                <label>Артикул BL <span className="required">*</span>:</label>
                <input
                  type="text"
                  value={formData.article_bl}
                  onChange={(e) => setFormData({ ...formData, article_bl: e.target.value })}
                  required
                />
              </div>
              <div className="form-row">
                <label>Артикул АГБ <span className="required">*</span>:</label>
                <input
                  type="text"
                  value={formData.article_agb}
                  onChange={(e) => setFormData({ ...formData, article_agb: e.target.value })}
                  required
                />
              </div>
              <div className="form-row">
                <label>Вариант подбора 1 <span className="required">*</span>:</label>
                <input
                  type="text"
                  value={formData.variant_1}
                  onChange={(e) => setFormData({ ...formData, variant_1: e.target.value })}
                  required
                />
              </div>
              <div className="form-row">
                <label>Вариант подбора 2 <span className="required">*</span>:</label>
                <input
                  type="text"
                  value={formData.variant_2}
                  onChange={(e) => setFormData({ ...formData, variant_2: e.target.value })}
                  required
                />
              </div>
              <div className="form-row">
                <label>Вариант подбора 3 <span className="required">*</span>:</label>
                <input
                  type="text"
                  value={formData.variant_3}
                  onChange={(e) => setFormData({ ...formData, variant_3: e.target.value })}
                  required
                />
              </div>
              <div className="form-row">
                <label>Вариант подбора 4 <span className="required">*</span>:</label>
                <input
                  type="text"
                  value={formData.variant_4}
                  onChange={(e) => setFormData({ ...formData, variant_4: e.target.value })}
                  required
                />
              </div>
              <div className="form-row">
                <label>Вариант подбора 5 <span className="required">*</span>:</label>
                <input
                  type="text"
                  value={formData.variant_5}
                  onChange={(e) => setFormData({ ...formData, variant_5: e.target.value })}
                  required
                />
              </div>
              <div className="form-row">
                <label>Вариант подбора 6 <span className="required">*</span>:</label>
                <input
                  type="text"
                  value={formData.variant_6}
                  onChange={(e) => setFormData({ ...formData, variant_6: e.target.value })}
                  required
                />
              </div>
              <div className="form-row">
                <label>Вариант подбора 7 <span className="required">*</span>:</label>
                <input
                  type="text"
                  value={formData.variant_7}
                  onChange={(e) => setFormData({ ...formData, variant_7: e.target.value })}
                  required
                />
              </div>
              <div className="form-row">
                <label>Вариант подбора 8 <span className="required">*</span>:</label>
                <input
                  type="text"
                  value={formData.variant_8}
                  onChange={(e) => setFormData({ ...formData, variant_8: e.target.value })}
                  required
                />
              </div>
              <div className="form-row">
                <label>Ед.изм. <span className="required">*</span>:</label>
                <input
                  type="text"
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  required
                />
              </div>
              <div className="form-row">
                <label>Код <span className="required">*</span>:</label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  required
                />
              </div>
              <div className="form-row">
                <label>Номенклатура АГБ <span className="required">*</span>:</label>
                <input
                  type="text"
                  value={formData.nomenclature_agb}
                  onChange={(e) => setFormData({ ...formData, nomenclature_agb: e.target.value })}
                  required
                />
              </div>
              <div className="form-row">
                <label>Фасовка для химии, кг. <span className="required">*</span>:</label>
                <input
                  type="text"
                  value={formData.packaging}
                  onChange={(e) => setFormData({ ...formData, packaging: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn-primary">
                {editingId ? 'Сохранить изменения' : 'Сохранить'}
              </button>
              <button type="button" onClick={handleCancelEdit}>Отмена</button>
            </div>
          </form>
        </div>
      )}

      <div className="upload-section">
        <div {...getRootProps()} className={`file-upload ${isDragActive ? 'dragover' : ''}`}>
          <input {...getInputProps()} />
          {uploading ? (
            <p>⏳ Загрузка и обработка файла...</p>
          ) : (
            <>
              <p>📄 Перетащите файл сюда или нажмите для выбора</p>
              <p className="upload-hint">Поддерживаются: CSV, Excel, PDF, изображения</p>
            </>
          )}
        </div>
      </div>

      {recognitionResults.length > 0 && (
        <div className="recognition-results">
          <h3>Результаты распознавания ({recognitionResults.length})</h3>
          <button className="btn-primary" onClick={handleExportResults}>
            📥 Выгрузить в Excel
          </button>
          <div className="results-table-container">
            <table className="mapping-table">
              <thead>
                <tr>
                  <th>Распознанный текст</th>
                  <th>Процент совпадения</th>
                  <th>Артикул АГБ</th>
                  <th>Номенклатура АГБ</th>
                  <th>Код</th>
                </tr>
              </thead>
              <tbody>
                {recognitionResults.map((result, idx) => (
                  <tr key={idx}>
                    <td>{result.recognized_text}</td>
                    <td>
                      <span className={`match-score score-${Math.floor(result.match_score / 25)}`}>
                        {result.match_score}%
                      </span>
                    </td>
                    <td>{result.mapping?.article_agb || '-'}</td>
                    <td>{result.mapping?.nomenclature_agb || '-'}</td>
                    <td>{result.mapping?.code || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {displayData.length > 0 && (
        <div className="table-container">
          <table className="mapping-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Артикул BL</th>
                <th>Артикул АГБ</th>
                <th>Вариант подбора 1</th>
                <th>Вариант подбора 2</th>
                <th>Вариант подбора 3</th>
                <th>Вариант подбора 4</th>
                <th>Вариант подбора 5</th>
                <th>Вариант подбора 6</th>
                <th>Вариант подбора 7</th>
                <th>Вариант подбора 8</th>
                <th>Ед.изм.</th>
                <th>Код</th>
                <th>Номенклатура АГБ</th>
                <th>Фасовка для химии, кг.</th>
                {searchQuery.trim() && <th>Совпадение</th>}
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {displayData.map((item) => {
                const m = item.mapping
                const matchScore = item.match_score !== null && item.match_score !== undefined ? item.match_score : null
                return (
                  <tr key={m.id}>
                    <td>{m.id}</td>
                    <td>{m.article_bl || '-'}</td>
                    <td>{m.article_agb || '-'}</td>
                    <td>{m.variant_1 || '-'}</td>
                    <td>{m.variant_2 || '-'}</td>
                    <td>{m.variant_3 || '-'}</td>
                    <td>{m.variant_4 || '-'}</td>
                    <td>{m.variant_5 || '-'}</td>
                    <td>{m.variant_6 || '-'}</td>
                    <td>{m.variant_7 || '-'}</td>
                    <td>{m.variant_8 || '-'}</td>
                    <td>{m.unit || '-'}</td>
                    <td>{m.code || '-'}</td>
                    <td>{m.nomenclature_agb || '-'}</td>
                    <td>{m.packaging || '-'}</td>
                    {searchQuery.trim() && matchScore !== null && (
                      <td>
                        <span className={`match-score score-${Math.floor(matchScore / 25)}`}>
                          {matchScore.toFixed(1)}%
                        </span>
                        {item.matched_fields && item.matched_fields.length > 0 && (
                          <div className="matched-fields">
                            {item.matched_fields.join(', ')}
                          </div>
                        )}
                      </td>
                    )}
                    <td>
                      <div className="action-buttons-cell">
                        <button
                          className="btn-edit btn-small"
                          onClick={() => handleEdit(m)}
                        >
                          ✏️ Редактировать
                        </button>
                        <button
                          className="btn-danger btn-small"
                          onClick={() => handleDelete(m.id)}
                        >
                          🗑️ Удалить
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && displayData.length === 0 && (
        <div className="empty-state">
          {searchQuery.trim() ? (
            <p>Ничего не найдено. Попробуйте изменить запрос или уменьшить минимальный процент совпадения.</p>
          ) : (
            <p>Таблица пуста. Добавьте строки вручную или загрузите файл.</p>
          )}
        </div>
      )}

      {!loading && !error && !searchQuery.trim() && totalPages > 1 && (
        <div className="pagination">
          <button
            className="pagination-btn"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            ← Предыдущая
          </button>
          <span className="pagination-info">
            Страница {currentPage} из {totalPages}
          </span>
          <button
            className="pagination-btn"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
          >
            Следующая →
          </button>
        </div>
      )}
    </div>
  )
}

export default TablePage
