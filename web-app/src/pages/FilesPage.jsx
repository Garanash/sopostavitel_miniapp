import React, { useState, useEffect } from 'react'
import axios from 'axios'
import './FilesPage.css'

function FilesPage({ userId }) {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)

  useEffect(() => {
    loadFiles()
  }, [userId])

  const loadFiles = async () => {
    try {
      setLoading(true)
      const params = userId ? { user_id: userId } : {}
      const response = await axios.get('/api/files', { params })
      setFiles(response.data)
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Ошибка при загрузке файлов')
    } finally {
      setLoading(false)
    }
  }

  const loadFileDetails = async (fileId) => {
    try {
      const response = await axios.get(`/api/files/${fileId}`)
      setSelectedFile(response.data)
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Ошибка при загрузке деталей')
    }
  }

  if (loading) {
    return <div className="loading">Загрузка...</div>
  }

  return (
    <div className="files-page">
      {error && <div className="error">{error}</div>}

      {!selectedFile ? (
        <>
          <div className="card">
            <h2>Обработанные файлы</h2>
            <p className="files-count">Всего файлов: {files.length}</p>
          </div>

          {files.length === 0 ? (
            <div className="card">
              <p className="empty-state">Нет обработанных файлов</p>
            </div>
          ) : (
            <div className="files-list">
              {files.map((file) => (
                <div key={file.id} className="card file-card">
                  <div className="file-card-header">
                    <div>
                      <h3 className="file-name">{file.file_name}</h3>
                      <p className="file-meta">
                        {new Date(file.created_at).toLocaleString('ru-RU')} • {file.file_type}
                      </p>
                    </div>
                    <span
                      className={`badge ${
                        file.status === 'completed'
                          ? 'badge-success'
                          : file.status === 'processing'
                          ? 'badge-warning'
                          : 'badge-error'
                      }`}
                    >
                      {file.status === 'completed'
                        ? 'Готово'
                        : file.status === 'processing'
                        ? 'Обработка'
                        : 'Ошибка'}
                    </span>
                  </div>
                  <div className="file-card-body">
                    <p className="matches-info">
                      Найдено совпадений: <strong>{file.matched_articles.length}</strong>
                    </p>
                    <button
                      className="btn"
                      onClick={() => loadFileDetails(file.id)}
                    >
                      Просмотреть детали
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="file-details">
          <button className="btn btn-secondary" onClick={() => setSelectedFile(null)}>
            ← Назад к списку
          </button>

          <div className="card">
            <h2>{selectedFile.file_name}</h2>
            <p className="file-meta">
              Загружен: {new Date(selectedFile.created_at).toLocaleString('ru-RU')}
            </p>
            <p className="file-meta">Тип: {selectedFile.file_type}</p>
            <p className="matches-count">
              Найдено совпадений: <strong>{selectedFile.matched_articles.length}</strong>
            </p>
          </div>

          {selectedFile.matched_articles.length > 0 ? (
            <div className="matches-list">
              {selectedFile.matched_articles.map((match) => (
                <div key={match.id} className="match-item">
                  <div className="match-item-header">
                    <div>
                      <span className="match-item-title">{match.article_number}</span>
                      <p className="match-item-name">{match.article_name}</p>
                    </div>
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
                    <strong>Контекст:</strong> {match.found_text}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card">
              <p className="empty-state">Артикулы не найдены</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default FilesPage

