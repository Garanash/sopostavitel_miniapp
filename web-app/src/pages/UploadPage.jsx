import React, { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import axios from 'axios'
import './UploadPage.css'

function UploadPage({ userId }) {
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [recognitionResults, setRecognitionResults] = useState([])
  const [sessionId, setSessionId] = useState(null)
  const [showRecognitionModal, setShowRecognitionModal] = useState(false)
  const [confirmingIds, setConfirmingIds] = useState(new Set())
  const [selectedMapping, setSelectedMapping] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [uploadingConfirmations, setUploadingConfirmations] = useState(false)

  const onDrop = useCallback(async (acceptedFiles) => {
    if (acceptedFiles.length === 0) return

    const file = acceptedFiles[0]
    setUploading(true)
    setError(null)
    setResult(null)
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
      
      // Сохраняем все результаты (включая "не найдено")
      setRecognitionResults(allResults)
      setSessionId(response.data.session_id)
      
      // Всегда открываем модальное окно, если есть результаты
      if (allResults.length > 0) {
        console.log('Открываю модальное окно со всеми результатами')
        setShowRecognitionModal(true)
      } else {
        // Нет результатов вообще
        const message = `✅ ${response.data.message}\nОбработано строк: ${response.data.recognized_count}`
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
      // Показываем индикатор загрузки
      const exportButton = document.querySelector('[aria-label="Выгрузить результаты в Excel"]')
      if (exportButton) {
        exportButton.disabled = true
        exportButton.textContent = '⏳ Выгрузка...'
      }

      const response = await axios.get(`/api/mappings/upload/export/${sessionId}`, {
        responseType: 'blob',
        timeout: 120000,
        headers: {
          'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }
      })

      // Проверяем, что ответ действительно Blob
      if (!(response.data instanceof Blob)) {
        throw new Error('Неверный формат ответа от сервера')
      }

      // Проверяем размер файла
      if (response.data.size === 0) {
        throw new Error('Получен пустой файл')
      }

      // Проверяем Content-Type
      const contentType = response.headers['content-type'] || response.headers['Content-Type']
      if (contentType && !contentType.includes('spreadsheetml')) {
        // Если это не Excel, возможно это ошибка в JSON
        const text = await response.data.text()
        try {
          const errorData = JSON.parse(text)
          throw new Error(errorData.detail || 'Ошибка при формировании файла')
        } catch {
          throw new Error('Получен файл неверного формата')
        }
      }

      // Создаем Blob с правильным MIME типом
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      })
      
      // Создаем URL для скачивания
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `results_${sessionId}.xlsx`
      link.style.display = 'none'
      
      // Добавляем в DOM, кликаем и удаляем
      document.body.appendChild(link)
      
      // Используем requestAnimationFrame для гарантии, что элемент добавлен
      requestAnimationFrame(() => {
        link.click()
        // Удаляем элемент и освобождаем URL после небольшой задержки
        setTimeout(() => {
          if (document.body.contains(link)) {
            document.body.removeChild(link)
          }
          window.URL.revokeObjectURL(url)
        }, 100)
      })
    } catch (err) {
      let errorMessage = 'Ошибка при выгрузке файла'
      if (err.response?.data) {
        if (err.response.data instanceof Blob) {
          // Если ответ - Blob с ошибкой, пытаемся прочитать как текст
          try {
            const text = await err.response.data.text()
            try {
              const errorData = JSON.parse(text)
              errorMessage = errorData.detail || errorMessage
            } catch {
              errorMessage = text || errorMessage
            }
          } catch (e) {
            errorMessage = 'Ошибка при чтении ответа сервера'
          }
        } else if (typeof err.response.data === 'object') {
          errorMessage = err.response.data.detail || err.response.data.message || errorMessage
        } else {
          errorMessage = err.response.data || errorMessage
        }
      } else if (err.message) {
        errorMessage = err.message
      }
      alert(`❌ ${errorMessage}`)
    } finally {
      // Восстанавливаем кнопку
      const exportButton = document.querySelector('[aria-label="Выгрузить результаты в Excel"]')
      if (exportButton) {
        exportButton.disabled = false
        exportButton.textContent = '📥 Выгрузить в Excel'
      }
    }
  }

  const openModal = (mapping, matchScore = null) => {
    setSelectedMapping({ mapping, matchScore })
    setShowModal(true)
    // Не закрываем модальное окно с результатами
  }

  const closeModal = (e) => {
    // Предотвращаем закрытие основного модального окна с результатами
    if (e && e.target === e.currentTarget) {
      // Клик по overlay - закрываем только модальное окно с подробной информацией
      setShowModal(false)
      setSelectedMapping(null)
      // НЕ закрываем основное модальное окно с результатами
      return
    }
    setShowModal(false)
    setSelectedMapping(null)
    // Возвращаемся к таблице результатов - НЕ закрываем основное окно
  }

  const handleUploadConfirmations = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.xlsx') && !file.name.toLowerCase().endsWith('.xls')) {
      alert('Поддерживаются только Excel файлы (.xlsx, .xls)')
      return
    }

    setUploadingConfirmations(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await axios.post('/api/mappings/upload-confirmations', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 300000,
      })

      let message = `✅ ${response.data.message}`
      if (response.data.errors_count > 0) {
        message += `\n\nОшибок: ${response.data.errors_count}`
        if (response.data.errors.length > 0) {
          message += `\n\nПервые ошибки:\n${response.data.errors.slice(0, 5).join('\n')}`
        }
      }
      alert(message)
      
      // Очищаем input
      event.target.value = ''
    } catch (err) {
      let errorMessage = 'Ошибка при загрузке файла'
      if (err.response?.data) {
        if (typeof err.response.data.detail === 'string') {
          errorMessage = err.response.data.detail
        } else if (err.response.data.detail?.msg) {
          errorMessage = err.response.data.detail.msg
        }
      } else if (err.message) {
        errorMessage = err.message
      }
      alert(`❌ ${errorMessage}`)
    } finally {
      setUploadingConfirmations(false)
    }
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpg', '.jpeg', '.png'],
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    },
    maxSize: 20 * 1024 * 1024, // 20 MB
  })

  return (
    <div className="upload-page">
      <div className="card">
        <h2>Загрузка файла</h2>
        <p className="upload-description">
          Загрузите счет, коммерческое предложение или другой документ для поиска артикулов
        </p>

        <div
          {...getRootProps()}
          className={`file-upload ${isDragActive ? 'dragover' : ''}`}
        >
          <input {...getInputProps()} />
          {uploading ? (
            <div className="loading">
              <p>⏳ Обработка файла...</p>
              <p className="upload-hint">Извлечение текста и поиск артикулов</p>
            </div>
          ) : (
            <div>
              <p className="upload-icon">📄</p>
              <p>
                {isDragActive
                  ? 'Отпустите файл здесь'
                  : 'Перетащите файл сюда или нажмите для выбора'}
              </p>
              <p className="upload-hint">
                Поддерживаются: PDF, изображения (JPG, PNG), Excel, Word
              </p>
            </div>
          )}
        </div>

        {error && <div className="error">{error}</div>}
      </div>

      {/* Модальное окно с результатами распознавания */}
      {showRecognitionModal && recognitionResults.length > 0 && (
        <div className="modal-overlay" onClick={(e) => {
          // Закрываем только если клик по overlay, а не по содержимому
          if (e.target === e.currentTarget && !showModal) {
            setShowRecognitionModal(false)
          }
        }}>
          <div className="modal-content recognition-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Результаты обработки файла ({recognitionResults.length})</h2>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                {recognitionResults.length > 0 && sessionId && (
                  <>
                    <button 
                  className="btn-primary" 
                  onClick={handleExportResults} 
                  style={{ margin: 0 }}
                  aria-label="Выгрузить результаты в Excel"
                >
                  📥 Выгрузить в Excel
                </button>
                    <label 
                      className="btn-primary" 
                      style={{ 
                        margin: 0, 
                        cursor: uploadingConfirmations ? 'wait' : 'pointer',
                        opacity: uploadingConfirmations ? 0.6 : 1
                      }}
                      aria-label="Загрузить файл с исправленными сопоставлениями"
                    >
                      {uploadingConfirmations ? '⏳ Загрузка...' : '📤 Загрузить исправления'}
                      <input
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={handleUploadConfirmations}
                        disabled={uploadingConfirmations}
                        style={{ display: 'none' }}
                        aria-label="Выбрать файл с исправлениями"
                      />
                    </label>
                  </>
                )}
                <button 
                className="modal-close" 
                onClick={() => setShowRecognitionModal(false)}
                aria-label="Закрыть модальное окно"
              >
                ×
              </button>
              </div>
            </div>
            <div className="modal-body">
              {recognitionResults.length > 0 ? (
                <div className="recognition-results-table-container">
                  <table className="recognition-results-table">
                    <thead>
                      <tr>
                        <th>Что искалось</th>
                        <th>Что найдено</th>
                        <th>Совпадение</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recognitionResults.map((result, idx) => {
                        const hasMatch = result.mapping && result.match_score !== null && result.match_score !== undefined
                        // По умолчанию показываем артикул BL, если нет BL - показываем артикул АГБ
                        const displayArticle = hasMatch 
                          ? (result.mapping.article_bl && result.mapping.article_bl.trim() !== '' && result.mapping.article_bl !== '-'
                              ? result.mapping.article_bl
                              : (result.mapping.article_agb && result.mapping.article_agb.trim() !== '' && result.mapping.article_agb !== '-'
                                  ? result.mapping.article_agb
                                  : '-'))
                          : null
                        const foundText = hasMatch 
                          ? `${displayArticle} / ${result.mapping.nomenclature_agb || '-'}`
                          : 'Не найдено'
                        
                        return (
                          <React.Fragment key={idx}>
                            <tr className={hasMatch ? 'has-match' : 'no-match'}>
                              <td className="search-text">{result.recognized_text || '-'}</td>
                              <td className="found-text">{foundText}</td>
                              <td className="match-score-cell">
                                {hasMatch ? (
                                  <span className={`match-score score-${Math.floor((result.match_score || 0) / 25)}`}>
                                    {result.match_score.toFixed(1)}%
                                  </span>
                                ) : (
                                  <span className="no-match-text">-</span>
                                )}
                              </td>
                              {!hasMatch && <td className="actions-cell"></td>}
                            </tr>
                            {hasMatch && (
                              <tr className={`actions-row ${hasMatch ? 'has-match' : 'no-match'}`}>
                                <td colSpan="3" className="actions-cell-full">
                                  <div className="actions-buttons-container">
                                    <button
                                      className="btn-details"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        // Не закрываем модальное окно с результатами, просто открываем подробную информацию поверх
                                        openModal(result.mapping, result.match_score)
                                      }}
                                    >
                                      Подробнее
                                    </button>
                                    <button
                                      className={`btn-confirm ${result.is_confirmed ? 'confirmed' : ''}`}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleConfirmMapping(result)
                                      }}
                                      disabled={confirmingIds.has(`${result.recognized_text}_${result.mapping_id}`) || result.is_confirmed}
                                      style={{
                                        background: result.is_confirmed 
                                          ? 'var(--tg-theme-button-color, #3390ec)' 
                                          : 'var(--tg-theme-secondary-bg-color, #f5f5f5)',
                                        color: result.is_confirmed ? 'white' : 'var(--tg-theme-text-color, #000)',
                                        border: result.is_confirmed ? 'none' : '1px solid var(--tg-theme-hint-color, #e0e0e0)',
                                        cursor: result.is_confirmed ? 'default' : 'pointer',
                                        opacity: confirmingIds.has(`${result.recognized_text}_${result.mapping_id}`) ? 0.6 : 1
                                      }}
                                    >
                                      {result.is_confirmed ? '✓ Подтверждено' : '✓ Подтвердить'}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">
                  <p>Нет результатов обработки</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно с подробной информацией - поверх модального окна с результатами */}
      {showModal && selectedMapping && (
        <div className="modal-overlay modal-overlay-details" onClick={(e) => closeModal(e)}>
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

export default UploadPage

