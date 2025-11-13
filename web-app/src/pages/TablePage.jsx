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
  const [selectedMapping, setSelectedMapping] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [showRecognitionModal, setShowRecognitionModal] = useState(false)
  const [confirmingIds, setConfirmingIds] = useState(new Set())
  
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
        // Фильтруем только записи с артикулом АГБ
        const filtered = response.data.items.filter(m => m.article_agb && m.article_agb.trim() !== '')
        setMappings(filtered)
        setTotalItems(response.data.total || 0)
        console.log(`Загружено записей: ${filtered.length} из ${response.data.total}`)
      } else {
        const filtered = response.data.filter(m => m.article_agb && m.article_agb.trim() !== '')
        setMappings(filtered)
        setTotalItems(filtered.length)
      }
    } catch (err) {
      console.error('Ошибка загрузки:', err)
      let errorMessage = 'Ошибка при загрузке таблицы'
      
      if (err.response?.data) {
        const errorData = err.response.data
        
        if (Array.isArray(errorData.detail)) {
          errorMessage = errorData.detail.map(e => {
            if (typeof e === 'object' && e.msg) {
              return `${e.loc?.join('.') || ''}: ${e.msg}`
            }
            return String(e)
          }).join(', ')
        } else if (typeof errorData.detail === 'string') {
          errorMessage = errorData.detail
        } else if (errorData.detail?.msg) {
          errorMessage = errorData.detail.msg
        } else if (typeof errorData.detail === 'object') {
          errorMessage = JSON.stringify(errorData.detail)
        } else {
          errorMessage = String(errorData.detail || errorData.message || errorMessage)
        }
      } else if (err.request) {
        errorMessage = 'Нет ответа от сервера. Проверьте подключение.'
      } else if (err.message) {
        errorMessage = err.message
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
      // Фильтруем только записи с артикулом АГБ
      const filtered = response.data.filter(item => 
        item.mapping && item.mapping.article_agb && item.mapping.article_agb.trim() !== ''
      )
      setSearchResults(filtered)
      console.log('Найдено результатов:', filtered.length)
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

  const openModal = (mapping, matchScore = null) => {
    setSelectedMapping({ mapping, matchScore })
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setSelectedMapping(null)
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
        timeout: 300000,
      })

      const allResults = response.data.results || []
      console.log('Все результаты:', allResults)
      console.log('Количество результатов:', allResults.length)
      
      // Фильтруем только результаты с совпадением > 80%
      const filteredResults = allResults.filter(result => {
        const hasMapping = result.mapping && typeof result.mapping === 'object'
        const hasScore = result.match_score !== null && result.match_score !== undefined
        const scoreAbove80 = hasScore && result.match_score > 80
        console.log('Результат:', { 
          match_score: result.match_score, 
          hasMapping, 
          hasScore, 
          scoreAbove80 
        })
        return hasMapping && hasScore && scoreAbove80
      })
      
      console.log('Отфильтрованные результаты (> 80%):', filteredResults)
      console.log('Количество отфильтрованных:', filteredResults.length)
      
      setRecognitionResults(filteredResults)
      setSessionId(response.data.session_id)
      
      // Всегда открываем модальное окно, если есть результаты
      // Но показываем только те, что > 80%
      if (filteredResults.length > 0) {
        console.log('Открываю модальное окно с результатами > 80%')
        setShowRecognitionModal(true)
      } else if (allResults.length > 0) {
        // Если есть результаты, но все < 80%, все равно показываем модальное окно
        console.log('Есть результаты, но все < 80%. Показываю пустое модальное окно')
        setShowRecognitionModal(true)
      } else {
        // Нет результатов вообще
        const message = `✅ ${response.data.message}\nНайдено совпадений: ${response.data.matches_count}`
        console.log('Нет результатов, показываю alert:', message)
        alert(message)
      }
    } catch (err) {
      let errorMessage = 'Ошибка при загрузке файла'
      
      if (err.response?.data) {
        const errorData = err.response.data
        
        if (Array.isArray(errorData.detail)) {
          errorMessage = errorData.detail.map(e => {
            if (typeof e === 'object' && e.msg) {
              return `${e.loc?.join('.') || ''}: ${e.msg}`
            }
            return String(e)
          }).join(', ')
        } else if (typeof errorData.detail === 'string') {
          errorMessage = errorData.detail
        } else if (errorData.detail?.msg) {
          errorMessage = errorData.detail.msg
        } else if (typeof errorData.detail === 'object') {
          errorMessage = JSON.stringify(errorData.detail)
        } else {
          errorMessage = String(errorData.detail || errorData.message || errorMessage)
        }
      } else if (err.message) {
        errorMessage = err.message
      }
      
      setError(errorMessage)
    } finally {
      setUploading(false)
    }
  }, [])

  const handleConfirmMapping = async (result) => {
    if (!result.recognized_text || !result.mapping_id) {
      alert('Недостаточно данных для подтверждения')
      return
    }

    const confirmKey = `${result.recognized_text}_${result.mapping_id}`
    if (confirmingIds.has(confirmKey)) {
      return // Уже подтверждается
    }

    setConfirmingIds(prev => new Set([...prev, confirmKey]))

    try {
      const response = await axios.post('/api/mappings/confirm', null, {
        params: {
          recognized_text: result.recognized_text,
          mapping_id: result.mapping_id,
          match_score: result.match_score
        }
      })

      alert(`✅ ${response.data.message}\nПодтверждений: ${response.data.user_confirmed}`)
      
      // Обновляем результат, помечая его как подтвержденный
      setRecognitionResults(prev => prev.map(r => 
        r.recognized_text === result.recognized_text && r.mapping_id === result.mapping_id
          ? { ...r, is_confirmed: true, match_score: 100.0 }
          : r
      ))
    } catch (err) {
      let errorMessage = 'Ошибка при подтверждении'
      
      if (err.response?.data) {
        const errorData = err.response.data
        if (typeof errorData.detail === 'string') {
          errorMessage = errorData.detail
        } else if (errorData.detail?.msg) {
          errorMessage = errorData.detail.msg
        }
      }
      
      alert(`❌ ${errorMessage}`)
    } finally {
      setConfirmingIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(confirmKey)
        return newSet
      })
    }
  }

  const handleExportResults = async () => {
    if (!sessionId) {
      alert('Нет результатов для выгрузки')
      return
    }

    try {
      const response = await axios.get(`/api/mappings/upload/export/${sessionId}`, {
        responseType: 'blob',
      })

      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `results_${sessionId}.xlsx`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      let errorMessage = 'Ошибка при выгрузке'
      
      if (err.response?.data) {
        const errorData = err.response.data
        
        if (Array.isArray(errorData.detail)) {
          errorMessage = errorData.detail.map(e => {
            if (typeof e === 'object' && e.msg) {
              return `${e.loc?.join('.') || ''}: ${e.msg}`
            }
            return String(e)
          }).join(', ')
        } else if (typeof errorData.detail === 'string') {
          errorMessage = errorData.detail
        } else if (errorData.detail?.msg) {
          errorMessage = errorData.detail.msg
        } else if (typeof errorData.detail === 'object') {
          errorMessage = JSON.stringify(errorData.detail)
        } else {
          errorMessage = String(errorData.detail || errorData.message || errorMessage)
        }
      } else if (err.message) {
        errorMessage = err.message
      }
      
      setError(errorMessage)
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
        await axios.put(`/api/mappings/${editingId}`, formData)
        setEditingId(null)
      } else {
        await axios.post('/api/mappings', formData)
      }
      setShowAddForm(false)
      resetForm()
      await loadMappings()
      if (showModal) {
        closeModal()
      }
    } catch (err) {
      let errorMessage = 'Ошибка при сохранении'
      
      if (err.response?.data) {
        const errorData = err.response.data
        
        if (Array.isArray(errorData.detail)) {
          errorMessage = errorData.detail.map(e => {
            if (typeof e === 'object' && e.msg) {
              return `${e.loc?.join('.') || ''}: ${e.msg}`
            }
            return String(e)
          }).join(', ')
        } else if (typeof errorData.detail === 'string') {
          errorMessage = errorData.detail
        } else if (errorData.detail?.msg) {
          errorMessage = errorData.detail.msg
        } else if (typeof errorData.detail === 'object') {
          errorMessage = JSON.stringify(errorData.detail)
        } else {
          errorMessage = String(errorData.detail || errorData.message || errorMessage)
        }
      } else if (err.message) {
        errorMessage = err.message
      }
      
      setError(errorMessage)
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
    closeModal()
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
      closeModal()
    } catch (err) {
      let errorMessage = 'Ошибка при удалении'
      
      if (err.response?.data) {
        const errorData = err.response.data
        
        if (Array.isArray(errorData.detail)) {
          errorMessage = errorData.detail.map(e => {
            if (typeof e === 'object' && e.msg) {
              return `${e.loc?.join('.') || ''}: ${e.msg}`
            }
            return String(e)
          }).join(', ')
        } else if (typeof errorData.detail === 'string') {
          errorMessage = errorData.detail
        } else if (errorData.detail?.msg) {
          errorMessage = errorData.detail.msg
        } else if (typeof errorData.detail === 'object') {
          errorMessage = JSON.stringify(errorData.detail)
        } else {
          errorMessage = String(errorData.detail || errorData.message || errorMessage)
        }
      } else if (err.message) {
        errorMessage = err.message
      }
      
      setError(errorMessage)
    }
  }
  
  const handlePageChange = (newPage) => {
    setCurrentPage(newPage)
    setSearchQuery('')
    setSearchResults([])
  }
  
  const totalPages = Math.ceil(totalItems / itemsPerPage)

  // Данные для отображения
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
      {!loading && !error && mappings.length === 0 && !searchQuery.trim() && (
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


      {/* Список записей с артикулом АГБ */}
      {displayData.length > 0 && (
        <div className="mappings-list">
          {displayData.map((item) => {
            const m = item.mapping
            const matchScore = item.match_score !== null && item.match_score !== undefined ? item.match_score : null
            
            return (
              <div key={m.id} className="mapping-item">
                <div className="mapping-item-content">
                  <div className="mapping-item-main">
                    <span className="mapping-article-agb">{m.article_agb || '-'}</span>
                    {matchScore !== null && (
                      <span className={`match-score score-${Math.floor(matchScore / 25)}`}>
                        {matchScore.toFixed(1)}%
                      </span>
                    )}
                  </div>
                  <button
                    className="btn-details"
                    onClick={() => openModal(m, matchScore)}
                  >
                    Подробнее
                  </button>
                </div>
              </div>
            )
          })}
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

      {/* Модальное окно с результатами распознавания */}
      {showRecognitionModal && (
        <div className="modal-overlay" onClick={() => setShowRecognitionModal(false)}>
          <div className="modal-content recognition-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Результаты обработки файла ({recognitionResults.length})</h2>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {recognitionResults.length > 0 && sessionId && (
                  <button className="btn-primary" onClick={handleExportResults} style={{ margin: 0 }}>
                    📥 Выгрузить в Excel
                  </button>
                )}
                <button className="modal-close" onClick={() => setShowRecognitionModal(false)}>×</button>
              </div>
            </div>
            <div className="modal-body">
              {recognitionResults.length > 0 ? (
                <div className="recognition-results-list">
                  {recognitionResults
                    .filter(result => result.match_score && result.match_score > 80 && result.mapping)
                    .map((result, idx) => (
                      <div key={idx} className="recognition-result-item">
                        <div className="recognition-result-main">
                          <div className="recognition-result-row">
                            <span className="recognition-label">Артикул АГБ:</span>
                            <span className="recognition-value">{result.mapping?.article_agb || '-'}</span>
                          </div>
                          <div className="recognition-result-row">
                            <span className="recognition-label">Номенклатура АГБ:</span>
                            <span className="recognition-value">{result.mapping?.nomenclature_agb || '-'}</span>
                          </div>
                          <div className="recognition-result-row">
                            <span className="recognition-label">Совпадение:</span>
                            <span className={`match-score score-${Math.floor((result.match_score || 0) / 25)}`}>
                              {result.match_score ? result.match_score.toFixed(1) : '0'}%
                            </span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <button
                            className="btn-details"
                            onClick={() => {
                              setShowRecognitionModal(false)
                              openModal(result.mapping, result.match_score)
                            }}
                          >
                            Подробнее
                          </button>
                          <button
                            className={`btn-confirm ${result.is_confirmed ? 'confirmed' : ''}`}
                            onClick={() => handleConfirmMapping(result)}
                            disabled={confirmingIds.has(`${result.recognized_text}_${result.mapping_id}`) || result.is_confirmed}
                            style={{
                              padding: '10px 20px',
                              background: result.is_confirmed 
                                ? 'var(--tg-theme-button-color, #3390ec)' 
                                : 'var(--tg-theme-secondary-bg-color, #f5f5f5)',
                              color: result.is_confirmed ? 'white' : 'var(--tg-theme-text-color, #000)',
                              border: result.is_confirmed ? 'none' : '1px solid var(--tg-theme-hint-color, #e0e0e0)',
                              borderRadius: '6px',
                              cursor: result.is_confirmed ? 'default' : 'pointer',
                              fontSize: '14px',
                              fontWeight: '600',
                              whiteSpace: 'nowrap',
                              opacity: confirmingIds.has(`${result.recognized_text}_${result.mapping_id}`) ? 0.6 : 1
                            }}
                          >
                            {result.is_confirmed ? '✓ Подтверждено' : '✓ Подтвердить'}
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="empty-state">
                  <p>Нет результатов с совпадением более 80%</p>
                  <p style={{ fontSize: '14px', color: 'var(--tg-theme-hint-color, #999999)', marginTop: '8px' }}>
                    Попробуйте загрузить другой файл или проверьте данные в таблице соответствий.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно с подробной информацией */}
      {showModal && selectedMapping && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Подробная информация</h2>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <div className="modal-body">
              {selectedMapping.matchScore !== null && (
                <div className="modal-field">
                  <label>Процент совпадения:</label>
                  <span className={`match-score score-${Math.floor(selectedMapping.matchScore / 25)}`}>
                    {selectedMapping.matchScore.toFixed(1)}%
                  </span>
                </div>
              )}
              <div className="modal-field">
                <label>ID:</label>
                <span>{selectedMapping.mapping.id}</span>
              </div>
              <div className="modal-field">
                <label>Артикул BL:</label>
                <span>{selectedMapping.mapping.article_bl || '-'}</span>
              </div>
              <div className="modal-field">
                <label>Артикул АГБ:</label>
                <span>{selectedMapping.mapping.article_agb || '-'}</span>
              </div>
              <div className="modal-field">
                <label>Вариант подбора 1:</label>
                <span>{selectedMapping.mapping.variant_1 || '-'}</span>
              </div>
              <div className="modal-field">
                <label>Вариант подбора 2:</label>
                <span>{selectedMapping.mapping.variant_2 || '-'}</span>
              </div>
              <div className="modal-field">
                <label>Вариант подбора 3:</label>
                <span>{selectedMapping.mapping.variant_3 || '-'}</span>
              </div>
              <div className="modal-field">
                <label>Вариант подбора 4:</label>
                <span>{selectedMapping.mapping.variant_4 || '-'}</span>
              </div>
              <div className="modal-field">
                <label>Вариант подбора 5:</label>
                <span>{selectedMapping.mapping.variant_5 || '-'}</span>
              </div>
              <div className="modal-field">
                <label>Вариант подбора 6:</label>
                <span>{selectedMapping.mapping.variant_6 || '-'}</span>
              </div>
              <div className="modal-field">
                <label>Вариант подбора 7:</label>
                <span>{selectedMapping.mapping.variant_7 || '-'}</span>
              </div>
              <div className="modal-field">
                <label>Вариант подбора 8:</label>
                <span>{selectedMapping.mapping.variant_8 || '-'}</span>
              </div>
              <div className="modal-field">
                <label>Ед.изм.:</label>
                <span>{selectedMapping.mapping.unit || '-'}</span>
              </div>
              <div className="modal-field">
                <label>Код:</label>
                <span>{selectedMapping.mapping.code || '-'}</span>
              </div>
              <div className="modal-field">
                <label>Номенклатура АГБ:</label>
                <span>{selectedMapping.mapping.nomenclature_agb || '-'}</span>
              </div>
              <div className="modal-field">
                <label>Фасовка для химии, кг.:</label>
                <span>{selectedMapping.mapping.packaging || '-'}</span>
              </div>
            </div>
            <div className="modal-actions">
              <button
                className="btn-edit"
                onClick={() => handleEdit(selectedMapping.mapping)}
              >
                ✏️ Редактировать
              </button>
              <button
                className="btn-danger"
                onClick={() => handleDelete(selectedMapping.mapping.id)}
              >
                🗑️ Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TablePage
