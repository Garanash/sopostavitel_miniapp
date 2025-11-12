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
  
  // Пагинация
  const [currentPage, setCurrentPage] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const itemsPerPage = 20
  
  const [formData, setFormData] = useState({
    code_1c: '',
    bortlanger: '',
    epiroc: '',
    almazgeobur: '',
    competitors: {}
  })
  const [newCompetitor, setNewCompetitor] = useState({ name: '', value: '' })

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
      
      // Новая структура ответа: { items, total, skip, limit }
      if (response.data.items) {
        setMappings(response.data.items)
        setTotalItems(response.data.total || 0)
        console.log(`Загружено записей: ${response.data.items.length} из ${response.data.total}`)
      } else {
        // Fallback для старого формата
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

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await axios.post('/api/mappings/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })

      alert(`✅ ${response.data.message}`)
      await loadMappings()
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Ошибка при загрузке файла')
    } finally {
      setUploading(false)
    }
  }, [])

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

  const handleAddCompetitor = () => {
    if (newCompetitor.name && newCompetitor.value) {
      setFormData({
        ...formData,
        competitors: {
          ...formData.competitors,
          [newCompetitor.name]: newCompetitor.value
        }
      })
      setNewCompetitor({ name: '', value: '' })
    }
  }

  const handleRemoveCompetitor = (name) => {
    const newCompetitors = { ...formData.competitors }
    delete newCompetitors[name]
    setFormData({ ...formData, competitors: newCompetitors })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await axios.post('/api/mappings', formData)
      setShowAddForm(false)
      setFormData({
        code_1c: '',
        bortlanger: '',
        epiroc: '',
        almazgeobur: '',
        competitors: {}
      })
      await loadMappings()
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Ошибка при создании строки')
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Удалить эту строку?')) return
    
    try {
      await axios.delete(`/api/mappings/${id}`)
      // Если удалили последний элемент на странице и страница не первая, переходим на предыдущую
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
    setSearchQuery('') // Сбрасываем поиск при смене страницы
    setSearchResults([])
  }
  
  const totalPages = Math.ceil(totalItems / itemsPerPage)

  const displayData = searchQuery.trim() ? searchResults : mappings.map(m => ({
    mapping: m,
    match_score: null,
    matched_fields: []
  }))

  const getAllCompetitorNames = () => {
    const names = new Set()
    mappings.forEach(m => {
      if (m.competitors) {
        Object.keys(m.competitors).forEach(name => names.add(name))
      }
    })
    return Array.from(names).sort()
  }

  const competitorNames = getAllCompetitorNames()

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
          <button className="btn-primary" onClick={() => setShowAddForm(!showAddForm)}>
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
          <h3>Добавить новую строку</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <label>Код 1С:</label>
              <input
                type="text"
                value={formData.code_1c}
                onChange={(e) => setFormData({ ...formData, code_1c: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label>Bortlanger:</label>
              <input
                type="text"
                value={formData.bortlanger}
                onChange={(e) => setFormData({ ...formData, bortlanger: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label>Epiroc:</label>
              <input
                type="text"
                value={formData.epiroc}
                onChange={(e) => setFormData({ ...formData, epiroc: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label>Almazgeobur:</label>
              <input
                type="text"
                value={formData.almazgeobur}
                onChange={(e) => setFormData({ ...formData, almazgeobur: e.target.value })}
              />
            </div>
            
            <div className="competitors-section">
              <h4>Конкуренты:</h4>
              {Object.entries(formData.competitors).map(([name, value]) => (
                <div key={name} className="competitor-item">
                  <span>{name}: {value}</span>
                  <button type="button" onClick={() => handleRemoveCompetitor(name)}>✕</button>
                </div>
              ))}
              <div className="add-competitor">
                <input
                  type="text"
                  placeholder="Название конкурента"
                  value={newCompetitor.name}
                  onChange={(e) => setNewCompetitor({ ...newCompetitor, name: e.target.value })}
                />
                <input
                  type="text"
                  placeholder="Значение"
                  value={newCompetitor.value}
                  onChange={(e) => setNewCompetitor({ ...newCompetitor, value: e.target.value })}
                />
                <button type="button" onClick={handleAddCompetitor}>Добавить</button>
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn-primary">Сохранить</button>
              <button type="button" onClick={() => setShowAddForm(false)}>Отмена</button>
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

      {loading && <div className="loading">Загрузка...</div>}

      {displayData.length > 0 && (
        <div className="table-container">
          <table className="mapping-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Код 1С</th>
                <th>Bortlanger</th>
                <th>Epiroc</th>
                <th>Almazgeobur</th>
                {competitorNames.map(name => (
                  <th key={name}>{name}</th>
                ))}
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
                    <td>{m.code_1c || '-'}</td>
                    <td>{m.bortlanger || '-'}</td>
                    <td>{m.epiroc || '-'}</td>
                    <td>{m.almazgeobur || '-'}</td>
                    {competitorNames.map(name => (
                      <td key={name}>{m.competitors?.[name] || '-'}</td>
                    ))}
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
                      <button
                        className="btn-danger btn-small"
                        onClick={() => handleDelete(m.id)}
                      >
                        Удалить
                      </button>
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

      {/* Пагинация - показываем только если не идет поиск */}
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

