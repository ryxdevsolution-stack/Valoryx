'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import api from '@/lib/api'

interface Note {
  note_id: string
  title?: string
  content: string
  created_at: string
  updated_at: string
  expires_at: string
  days_remaining: number
}

interface NotesModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function NotesModal({ isOpen, onClose }: NotesModalProps) {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    days_to_keep: 5
  })
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) {
      fetchNotes()
    }
  }, [isOpen])

  const fetchNotes = async () => {
    try {
      setLoading(true)
      const response = await api.get('/notes')
      if (response.data.success) {
        setNotes(response.data.notes)
      }
    } catch (err: any) {
      console.error('Failed to fetch notes:', err)
      setError('Failed to load notes')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateNote = async () => {
    if (!formData.content.trim()) {
      setError('Content is required')
      return
    }

    try {
      setLoading(true)
      setError('')
      const response = await api.post('/notes', formData)
      if (response.data.success) {
        await fetchNotes()
        setIsCreating(false)
        setFormData({ title: '', content: '', days_to_keep: 5 })
      }
    } catch (err: any) {
      console.error('Failed to create note:', err)
      setError(err.response?.data?.error || 'Failed to create note')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateNote = async () => {
    if (!selectedNote || !formData.content.trim()) {
      setError('Content is required')
      return
    }

    try {
      setLoading(true)
      setError('')
      const response = await api.put(`/notes/${selectedNote.note_id}`, {
        title: formData.title,
        content: formData.content
      })
      if (response.data.success) {
        await fetchNotes()
        setIsEditing(false)
        setSelectedNote(null)
        setFormData({ title: '', content: '', days_to_keep: 5 })
      }
    } catch (err: any) {
      console.error('Failed to update note:', err)
      setError(err.response?.data?.error || 'Failed to update note')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm('Are you sure you want to delete this note?')) return

    try {
      setLoading(true)
      const response = await api.delete(`/notes/${noteId}`)
      if (response.data.success) {
        await fetchNotes()
        setSelectedNote(null)
      }
    } catch (err: any) {
      console.error('Failed to delete note:', err)
      setError('Failed to delete note')
    } finally {
      setLoading(false)
    }
  }

  const selectNote = (note: Note) => {
    setSelectedNote(note)
    setFormData({
      title: note.title || '',
      content: note.content,
      days_to_keep: 5
    })
    setIsCreating(false)
    setIsEditing(false)
  }

  const startCreating = () => {
    setIsCreating(true)
    setIsEditing(false)
    setSelectedNote(null)
    setFormData({ title: '', content: '', days_to_keep: 5 })
    setError('')
  }

  const startEditing = () => {
    if (selectedNote) {
      setIsEditing(true)
      setIsCreating(false)
      setFormData({
        title: selectedNote.title || '',
        content: selectedNote.content,
        days_to_keep: 5
      })
      setError('')
    }
  }

  const cancelEdit = () => {
    setIsEditing(false)
    setIsCreating(false)
    setSelectedNote(null)
    setFormData({ title: '', content: '', days_to_keep: 5 })
    setError('')
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Notes</h2>
                <button
                  onClick={onClose}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content */}
              <div className="flex h-[calc(90vh-120px)]">
                {/* Notes List */}
                <div className="w-1/3 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
                  <div className="p-4">
                    <button
                      onClick={startCreating}
                      disabled={loading}
                      className="w-full px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      New Note
                    </button>
                  </div>

                  <div className="px-4 pb-4 space-y-2">
                    {loading && notes.length === 0 ? (
                      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        Loading notes...
                      </div>
                    ) : notes.length === 0 ? (
                      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        No notes yet. Create your first note!
                      </div>
                    ) : (
                      notes.map((note) => (
                        <button
                          key={note.note_id}
                          onClick={() => selectNote(note)}
                          className={`w-full text-left p-4 rounded-lg transition-colors ${
                            selectedNote?.note_id === note.note_id
                              ? 'bg-indigo-100 dark:bg-indigo-900/30 border-2 border-indigo-500'
                              : 'bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 border-2 border-transparent'
                          }`}
                        >
                          <h3 className="font-semibold text-gray-900 dark:text-white mb-1 truncate">
                            {note.title || 'Untitled Note'}
                          </h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-2">
                            {note.content}
                          </p>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-400 dark:text-gray-500">
                              {formatDate(note.updated_at)}
                            </span>
                            <span className={`px-2 py-1 rounded-full ${
                              note.days_remaining <= 1
                                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                : note.days_remaining <= 3
                                ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                                : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            }`}>
                              {note.days_remaining}d left
                            </span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>

                {/* Note Content/Editor */}
                <div className="flex-1 overflow-y-auto p-6">
                  {error && (
                    <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg text-sm">
                      {error}
                    </div>
                  )}

                  {isCreating || isEditing ? (
                    <div className="space-y-4">
                      <input
                        type="text"
                        placeholder="Note title (optional)"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        className="w-full px-4 py-3 text-lg font-semibold border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                      <textarea
                        placeholder="Write your note here..."
                        value={formData.content}
                        onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                        rows={15}
                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                      />
                      {isCreating && (
                        <div className="flex items-center gap-3">
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Keep for:
                          </label>
                          <select
                            value={formData.days_to_keep}
                            onChange={(e) => setFormData({ ...formData, days_to_keep: parseInt(e.target.value) })}
                            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          >
                            <option value={5}>5 days (minimum)</option>
                            <option value={7}>7 days</option>
                            <option value={14}>14 days</option>
                            <option value={30}>30 days</option>
                          </select>
                        </div>
                      )}
                      <div className="flex gap-3">
                        <button
                          onClick={isCreating ? handleCreateNote : handleUpdateNote}
                          disabled={loading || !formData.content.trim()}
                          className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {loading ? 'Saving...' : (isCreating ? 'Create Note' : 'Update Note')}
                        </button>
                        <button
                          onClick={cancelEdit}
                          disabled={loading}
                          className="px-6 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : selectedNote ? (
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                          {selectedNote.title || 'Untitled Note'}
                        </h1>
                        <div className="flex gap-2">
                          <button
                            onClick={startEditing}
                            className="p-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors"
                            title="Edit note"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteNote(selectedNote.note_id)}
                            className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                            title="Delete note"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 mb-6 text-sm text-gray-500 dark:text-gray-400">
                        <span>Created: {formatDate(selectedNote.created_at)}</span>
                        <span>•</span>
                        <span>Updated: {formatDate(selectedNote.updated_at)}</span>
                        <span>•</span>
                        <span className={`font-medium ${
                          selectedNote.days_remaining <= 1
                            ? 'text-red-600 dark:text-red-400'
                            : selectedNote.days_remaining <= 3
                            ? 'text-yellow-600 dark:text-yellow-400'
                            : 'text-green-600 dark:text-green-400'
                        }`}>
                          Expires in {selectedNote.days_remaining} days
                        </span>
                      </div>
                      <div className="prose prose-gray dark:prose-invert max-w-none">
                        <p className="whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                          {selectedNote.content}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500">
                      <div className="text-center">
                        <svg className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p className="text-lg font-medium">Select a note to view</p>
                        <p className="text-sm mt-1">or create a new one</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
