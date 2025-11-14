import React, { useState, useEffect } from 'react'
import axios from 'axios'
import ArticleSearchPage from './pages/ArticleSearchPage'
import UploadPage from './pages/UploadPage'
import TablePage from './pages/TablePage'
import './App.css'

// Используем относительные пути - Nginx проксирует /api на backend
// Для продакшена API_URL пустой, запросы идут через тот же домен
const API_URL = import.meta.env.VITE_API_URL || ''

// Настройка axios
axios.defaults.baseURL = API_URL
axios.defaults.timeout = 30000

// Interceptor для логирования запросов (только в dev)
if (import.meta.env.DEV) {
  axios.interceptors.request.use(
    (config) => {
      console.log('API Request:', config.method?.toUpperCase(), config.url)
      return config
    },
    (error) => {
      console.error('API Request Error:', error)
      return Promise.reject(error)
    }
  )
  
  axios.interceptors.response.use(
    (response) => {
      console.log('API Response:', response.status, response.config.url)
      return response
    },
    (error) => {
      console.error('API Response Error:', error.response?.status, error.config?.url, error.message)
      return Promise.reject(error)
    }
  )
}

function App() {
  const [activeTab, setActiveTab] = useState('upload')
  const [userId, setUserId] = useState(null)

  useEffect(() => {
    // Инициализация Telegram WebApp
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.ready()
      window.Telegram.WebApp.expand()
      
      // Получаем user_id из Telegram WebApp
      const tgUser = window.Telegram.WebApp.initDataUnsafe?.user
      if (tgUser?.id) {
        setUserId(tgUser.id)
        return
      }
    }
    
    // Получаем user_id из URL параметров (fallback)
    const urlParams = new URLSearchParams(window.location.search)
    const uid = urlParams.get('user_id')
    if (uid) {
      setUserId(parseInt(uid))
    } else {
      // Для тестирования
      setUserId(1)
    }
  }, [])

  return (
    <div className="app">
      <div className="container">
        <h1 className="app-title">🔍 Сопоставление артикулов</h1>
        
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'upload' ? 'active' : ''}`}
            onClick={() => setActiveTab('upload')}
          >
            📄 Файл
          </button>
          <button
            className={`tab ${activeTab === 'articles' ? 'active' : ''}`}
            onClick={() => setActiveTab('articles')}
          >
            🔍 Артикул
          </button>
          <button
            className={`tab ${activeTab === 'table' ? 'active' : ''}`}
            onClick={() => setActiveTab('table')}
          >
            📋 Таблица
          </button>
        </div>

        {activeTab === 'upload' && <UploadPage userId={userId} />}
        {activeTab === 'articles' && <ArticleSearchPage />}
        {activeTab === 'table' && <TablePage />}
      </div>
    </div>
  )
}

export default App

