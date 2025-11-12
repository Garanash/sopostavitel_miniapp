import React, { useState, useEffect } from 'react'
import axios from 'axios'
import './ArticlesPage.css'

function ArticlesPage() {
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    article_number: '',
    name: '',
    description: '',
    price: '',
    category: '',
  })

  useEffect(() => {
    loadArticles()
  }, [])

  const loadArticles = async () => {
    try {
      setLoading(true)
      const params = search ? { search } : {}
      const response = await axios.get('/api/articles', { params })
      setArticles(response.data)
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Ошибка при загрузке артикулов')
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (e) => {
    setSearch(e.target.value)
    // Debounce поиска
    clearTimeout(window.searchTimeout)
    window.searchTimeout = setTimeout(() => {
      loadArticles()
    }, 500)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const data = {
        ...formData,
        price: formData.price ? parseFloat(formData.price) : null,
      }
      await axios.post('/api/articles', data)
      setShowForm(false)
      setFormData({
        article_number: '',
        name: '',
        description: '',
        price: '',
        category: '',
      })
      loadArticles()
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Ошибка при создании артикула')
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Удалить этот артикул?')) return

    try {
      await axios.delete(`/api/articles/${id}`)
      loadArticles()
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Ошибка при удалении артикула')
    }
  }

  if (loading) {
    return <div className="loading">Загрузка...</div>
  }

  return (
    <div className="articles-page">
      <div className="card">
        <div className="articles-header">
          <h2>Артикулы</h2>
          <button className="btn" onClick={() => setShowForm(!showForm)}>
            {showForm ? '✕ Отмена' : '+ Добавить артикул'}
          </button>
        </div>

        <div className="search-box">
          <input
            type="text"
            className="input"
            placeholder="Поиск по артикулу или названию..."
            value={search}
            onChange={handleSearch}
          />
        </div>

        {showForm && (
          <form className="article-form" onSubmit={handleSubmit}>
            <label className="label">Артикул *</label>
            <input
              type="text"
              className="input"
              required
              value={formData.article_number}
              onChange={(e) =>
                setFormData({ ...formData, article_number: e.target.value })
              }
            />

            <label className="label">Название *</label>
            <input
              type="text"
              className="input"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />

            <label className="label">Описание</label>
            <textarea
              className="input"
              rows="3"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
            />

            <label className="label">Цена</label>
            <input
              type="number"
              step="0.01"
              className="input"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: e.target.value })}
            />

            <label className="label">Категория</label>
            <input
              type="text"
              className="input"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            />

            <button type="submit" className="btn">
              Сохранить
            </button>
          </form>
        )}
      </div>

      {error && <div className="error">{error}</div>}

      <div className="articles-count">
        Всего артикулов: {articles.length}
      </div>

      {articles.length === 0 ? (
        <div className="card">
          <p className="empty-state">Нет артикулов в базе</p>
        </div>
      ) : (
        <div className="articles-list">
          {articles.map((article) => (
            <div key={article.id} className="card article-card">
              <div className="article-header">
                <div>
                  <h3 className="article-number">{article.article_number}</h3>
                  <p className="article-name">{article.name}</p>
                </div>
                <button
                  className="btn btn-danger"
                  onClick={() => handleDelete(article.id)}
                >
                  Удалить
                </button>
              </div>
              {article.description && (
                <p className="article-description">{article.description}</p>
              )}
              <div className="article-footer">
                {article.price && (
                  <span className="article-price">{article.price} ₽</span>
                )}
                {article.category && (
                  <span className="article-category">{article.category}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default ArticlesPage

