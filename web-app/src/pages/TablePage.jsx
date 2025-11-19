import React, { useState, useEffect } from 'react'
import axios from 'axios'
import './TablePage.css'

function TablePage() {
  const [mappings, setMappings] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [selectedMapping, setSelectedMapping] = useState(null)
  const [showModal, setShowModal] = useState(false)
  
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

  const openModal = (mapping, matchScore = null) => {
    setSelectedMapping({ mapping, matchScore })
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setSelectedMapping(null)
  }

  const resetForm = () => {
    setFormData({
      article_bl: '-',
      article_agb: '-',
      variant_1: '-',
      variant_2: '-',
      variant_3: '-',
      variant_4: '-',
      variant_5: '-',
      variant_6: '-',
      variant_7: '-',
      variant_8: '-',
      unit: '-',
      code: '-',
      nomenclature_agb: '-',
      packaging: '-'
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    // Заменяем пустые значения на "-"
    const dataToSend = {}
    for (const key in formData) {
      dataToSend[key] = formData[key].trim() === '' ? '-' : formData[key].trim()
    }
    
    try {
      if (editingId) {
        await axios.put(`/api/mappings/${editingId}`, dataToSend)
        setEditingId(null)
      } else {
        await axios.post('/api/mappings', dataToSend)
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
      article_bl: mapping.article_bl || '-',
      article_agb: mapping.article_agb || '-',
      variant_1: mapping.variant_1 || '-',
      variant_2: mapping.variant_2 || '-',
      variant_3: mapping.variant_3 || '-',
      variant_4: mapping.variant_4 || '-',
      variant_5: mapping.variant_5 || '-',
      variant_6: mapping.variant_6 || '-',
      variant_7: mapping.variant_7 || '-',
      variant_8: mapping.variant_8 || '-',
      unit: mapping.unit || '-',
      code: mapping.code || '-',
      nomenclature_agb: mapping.nomenclature_agb || '-',
      packaging: mapping.packaging || '-'
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
  }
  
  const totalPages = Math.ceil(totalItems / itemsPerPage)

  // Данные для отображения
  const displayData = mappings.map(m => ({
    mapping: m,
    match_score: null,
    matched_fields: []
  }))

  return (
    <div className="table-page">
      <div className="table-controls">
        <div className="action-buttons">
          <button 
            className="btn-primary" 
            onClick={() => {
              if (showAddForm && !editingId) {
                setShowAddForm(false)
                resetForm()
              } else if (!showAddForm) {
                setShowAddForm(true)
                setEditingId(null)
                resetForm()
              }
            }}
            aria-label={showAddForm && !editingId ? "Закрыть форму добавления" : "Добавить новую строку"}
          >
            {showAddForm && !editingId ? '✖️ Отмена' : '➕ Добавить строку'}
          </button>
        </div>
      </div>

      {error && <div className="error">❌ {error}</div>}
      {loading && <div className="loading">⏳ Загрузка данных...</div>}
      {!loading && !error && mappings.length === 0 && (
        <div className="info">ℹ️ Таблица пуста. Добавьте строку вручную.</div>
      )}
      {!loading && !error && totalItems > 0 && (
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
                <label>Артикул BL:</label>
                <input
                  type="text"
                  value={formData.article_bl}
                  onChange={(e) => setFormData({ ...formData, article_bl: e.target.value })}
                  placeholder="-"
                />
              </div>
              <div className="form-row">
                <label>Артикул АГБ:</label>
                <input
                  type="text"
                  value={formData.article_agb}
                  onChange={(e) => setFormData({ ...formData, article_agb: e.target.value })}
                  placeholder="-"
                />
              </div>
              <div className="form-row">
                <label>Вариант подбора 1:</label>
                <input
                  type="text"
                  value={formData.variant_1}
                  onChange={(e) => setFormData({ ...formData, variant_1: e.target.value })}
                  placeholder="-"
                />
              </div>
              <div className="form-row">
                <label>Вариант подбора 2:</label>
                <input
                  type="text"
                  value={formData.variant_2}
                  onChange={(e) => setFormData({ ...formData, variant_2: e.target.value })}
                  placeholder="-"
                />
              </div>
              <div className="form-row">
                <label>Вариант подбора 3:</label>
                <input
                  type="text"
                  value={formData.variant_3}
                  onChange={(e) => setFormData({ ...formData, variant_3: e.target.value })}
                  placeholder="-"
                />
              </div>
              <div className="form-row">
                <label>Вариант подбора 4:</label>
                <input
                  type="text"
                  value={formData.variant_4}
                  onChange={(e) => setFormData({ ...formData, variant_4: e.target.value })}
                  placeholder="-"
                />
              </div>
              <div className="form-row">
                <label>Вариант подбора 5:</label>
                <input
                  type="text"
                  value={formData.variant_5}
                  onChange={(e) => setFormData({ ...formData, variant_5: e.target.value })}
                  placeholder="-"
                />
              </div>
              <div className="form-row">
                <label>Вариант подбора 6:</label>
                <input
                  type="text"
                  value={formData.variant_6}
                  onChange={(e) => setFormData({ ...formData, variant_6: e.target.value })}
                  placeholder="-"
                />
              </div>
              <div className="form-row">
                <label>Вариант подбора 7:</label>
                <input
                  type="text"
                  value={formData.variant_7}
                  onChange={(e) => setFormData({ ...formData, variant_7: e.target.value })}
                  placeholder="-"
                />
              </div>
              <div className="form-row">
                <label>Вариант подбора 8:</label>
                <input
                  type="text"
                  value={formData.variant_8}
                  onChange={(e) => setFormData({ ...formData, variant_8: e.target.value })}
                  placeholder="-"
                />
              </div>
              <div className="form-row">
                <label>Ед.изм.:</label>
                <input
                  type="text"
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  placeholder="-"
                />
              </div>
              <div className="form-row">
                <label>Код:</label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="-"
                />
              </div>
              <div className="form-row">
                <label>Номенклатура АГБ:</label>
                <input
                  type="text"
                  value={formData.nomenclature_agb}
                  onChange={(e) => setFormData({ ...formData, nomenclature_agb: e.target.value })}
                  placeholder="-"
                />
              </div>
              <div className="form-row">
                <label>Фасовка для химии, кг.:</label>
                <input
                  type="text"
                  value={formData.packaging}
                  onChange={(e) => setFormData({ ...formData, packaging: e.target.value })}
                  placeholder="-"
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
                    <div className="mapping-nomenclature-agb">
                      <span className="mapping-label">Номенклатура АГБ:</span>
                      <span className="mapping-value">{m.nomenclature_agb || '-'}</span>
                    </div>
                    <div className="mapping-article-bl">
                      <span className="mapping-label">Артикул BL:</span>
                      <span className="mapping-value">{m.article_bl || '-'}</span>
                    </div>
                    <div className="mapping-article-agb">
                      <span className="mapping-label">Артикул АГБ:</span>
                      <span className="mapping-value">{m.article_agb || '-'}</span>
                    </div>
                    {matchScore !== null && (
                      <div className="mapping-match-score">
                        <span className="mapping-label">Совпадение:</span>
                        <span className={`match-score score-${Math.floor(matchScore / 25)}`}>
                          {matchScore.toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>
                  <button
                    className="btn-details"
                    onClick={() => openModal(m, matchScore)}
                    aria-label={`Подробная информация о записи ${m.id}`}
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
          <p>Таблица пуста. Добавьте строки вручную.</p>
        </div>
      )}

      {!loading && !error && totalPages > 1 && (
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

      {/* Модальное окно с подробной информацией */}
      {showModal && selectedMapping && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Подробная информация</h2>
              <button 
                className="modal-close" 
                onClick={closeModal}
                aria-label="Закрыть подробную информацию"
              >
                ×
              </button>
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
