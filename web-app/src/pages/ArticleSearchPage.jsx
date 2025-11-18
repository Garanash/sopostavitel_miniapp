import React, { useState } from 'react'
import axios from 'axios'
import './ArticleSearchPage.css'

function ArticleSearchPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [minScore, setMinScore] = useState(50)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searchResults, setSearchResults] = useState([])
  const [selectedMapping, setSelectedMapping] = useState(null)
  const [showModal, setShowModal] = useState(false)

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

  return (
    <div className="article-search-page">
      <div className="search-section">
        <div className="search-input-group">
          <input
            type="text"
            className="search-input"
            placeholder="Введите артикул для поиска..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && !loading && handleSearch()}
            aria-label="Поле поиска артикула"
            disabled={loading}
          />
          <button 
            className="search-button" 
            onClick={handleSearch} 
            disabled={loading}
            aria-label="Выполнить поиск"
          >
            {loading ? '⏳ Поиск...' : '🔍 Поиск'}
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

      {error && <div className="error">❌ {error}</div>}
      {loading && <div className="loading">⏳ Поиск...</div>}

      {!loading && searchQuery.trim() && searchResults.length === 0 && (
        <div className="empty-state">
          <p>Ничего не найдено. Попробуйте изменить запрос или уменьшить минимальный процент совпадения.</p>
        </div>
      )}

      {searchResults.length > 0 && (
        <div className="search-results">
          <h3>Найдено результатов: {searchResults.length}</h3>
          <div className="results-list">
            {searchResults.map((item) => {
              const m = item.mapping
              const matchScore = item.match_score !== null && item.match_score !== undefined ? item.match_score : null
              
              return (
                <div key={m.id} className="result-item">
                  <div className="result-item-content">
                    <div className="result-item-main">
                      <div className="result-article-agb">
                        <span className="result-label">Артикул АГБ:</span>
                        <span className="result-value">{m.article_agb || '-'}</span>
                      </div>
                      <div className="result-nomenclature-agb">
                        <span className="result-label">Номенклатура АГБ:</span>
                        <span className="result-value">{m.nomenclature_agb || '-'}</span>
                      </div>
                      {matchScore !== null && (
                        <div className="result-match-score">
                          <span className="result-label">Совпадение:</span>
                          <span className={`match-score score-${Math.floor(matchScore / 25)}`}>
                            {matchScore.toFixed(1)}%
                          </span>
                        </div>
                      )}
                    </div>
                    <button
                      className="btn-details"
                      onClick={() => openModal(m, matchScore)}
                      aria-label={`Подробная информация о ${m.article_agb || m.article_bl || 'записи'}`}
                    >
                      Подробнее
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
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
          </div>
        </div>
      )}
    </div>
  )
}

export default ArticleSearchPage

