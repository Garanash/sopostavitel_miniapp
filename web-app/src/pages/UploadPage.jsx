import React, { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import axios from 'axios'
import './UploadPage.css'

function UploadPage({ userId }) {
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const onDrop = useCallback(async (acceptedFiles) => {
    if (!userId) {
      setError('Не указан ID пользователя')
      return
    }

    if (acceptedFiles.length === 0) return

    const file = acceptedFiles[0]
    setUploading(true)
    setError(null)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('user_id', userId)

      const response = await axios.post('/api/files/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })

      setResult(response.data)
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Ошибка при загрузке файла')
    } finally {
      setUploading(false)
    }
  }, [userId])

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

        {result && (
          <div className="upload-result">
            <div className="success">
              ✅ Файл успешно обработан!
            </div>
            <div className="result-info">
              <h3>Результаты:</h3>
              <p className="matches-count">
                Найдено совпадений: <strong>{result.matches_count}</strong>
              </p>

              {result.matches && result.matches.length > 0 && (
                <div className="matches-list">
                  <h4>Найденные артикулы:</h4>
                  {result.matches.map((match, index) => (
                    <div key={index} className="match-item">
                      <div className="match-item-header">
                        <span className="match-item-title">{match.article}</span>
                        <span
                          className="match-item-confidence"
                          style={{
                            background:
                              match.confidence > 0.8
                                ? '#10b981'
                                : match.confidence > 0.5
                                ? '#f59e0b'
                                : '#ef4444',
                            color: 'white',
                          }}
                        >
                          {Math.round(match.confidence * 100)}%
                        </span>
                      </div>
                      <div className="match-item-text">
                        {match.found_text}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default UploadPage

