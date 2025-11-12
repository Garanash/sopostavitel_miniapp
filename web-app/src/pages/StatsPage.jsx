import React, { useState, useEffect } from 'react'
import axios from 'axios'
import './StatsPage.css'

function StatsPage() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    try {
      setLoading(true)
      const response = await axios.get('/api/stats')
      setStats(response.data)
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Ошибка при загрузке статистики')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="loading">Загрузка...</div>
  }

  if (error) {
    return <div className="error">{error}</div>
  }

  return (
    <div className="stats-page">
      <div className="card">
        <h2>📊 Статистика</h2>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">📦</div>
            <div className="stat-value">{stats?.articles_count || 0}</div>
            <div className="stat-label">Артикулов в базе</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">📄</div>
            <div className="stat-value">{stats?.files_count || 0}</div>
            <div className="stat-label">Обработано файлов</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">✅</div>
            <div className="stat-value">{stats?.matches_count || 0}</div>
            <div className="stat-label">Найдено совпадений</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Информация о системе</h3>
        <div className="info-list">
          <div className="info-item">
            <span className="info-label">Версия API:</span>
            <span className="info-value">1.0.0</span>
          </div>
          <div className="info-item">
            <span className="info-label">Поддерживаемые форматы:</span>
            <span className="info-value">PDF, JPG, PNG, XLSX, DOCX</span>
          </div>
          <div className="info-item">
            <span className="info-label">Максимальный размер файла:</span>
            <span className="info-value">20 MB</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default StatsPage

