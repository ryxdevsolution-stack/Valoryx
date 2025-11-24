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
            className="fixed inset-0 bg-black/60 backdrop-blur-md z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 20 }}
            transition={{ type: "spring", duration: 0.5, bounce: 0.3 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden border border-gray-200/50 dark:border-gray-700/50">
              {/* Header */}
              <div className="flex items-center justify-between px-8 py-5 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-900">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl">
                    <svg className="w-6 h-6 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Notes</h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Manage your personal notes</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-200 hover:rotate-90"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content */}
              <div className="flex h-[calc(90vh-120px)]">
                {/* Notes List */}
                <div className="w-[380px] border-r border-gray-100 dark:border-gray-800 overflow-y-auto bg-gray-50/50 dark:bg-gray-800/30">
                  <div className="p-5">
                    <button
                      onClick={startCreating}
                      disabled={loading}
                      className="w-full px-5 py-3.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-semibold rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/40 hover:-translate-y-0.5"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                      </svg>
                      New Note
                    </button>
                  </div>

                  <div className="px-5 pb-5 space-y-3">
                    {loading && notes.length === 0 ? (
                      <div className="text-center py-16">
                        <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-gray-200 border-t-indigo-600 dark:border-gray-700 dark:border-t-indigo-400 mb-4"></div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Loading notes...</p>
                      </div>
                    ) : notes.length === 0 ? (
                      <div className="text-center py-16">
                        <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/20 dark:to-purple-900/20 flex items-center justify-center">
                          <svg className="w-10 h-10 text-indigo-400 dark:text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">No notes yet</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Create your first note to get started</p>
                      </div>
                    ) : (
                      notes.map((note) => (
                        <motion.button
                          key={note.note_id}
                          onClick={() => selectNote(note)}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          className={`w-full text-left p-4 rounded-xl transition-all duration-200 ${
                            selectedNote?.note_id === note.note_id
                              ? 'bg-white dark:bg-gray-800 shadow-lg shadow-indigo-500/10 ring-2 ring-indigo-500 dark:ring-indigo-400'
                              : 'bg-white dark:bg-gray-800/50 hover:bg-white dark:hover:bg-gray-800 hover:shadow-md border border-gray-100 dark:border-gray-700/50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <h3 className="font-semibold text-gray-900 dark:text-white text-sm leading-tight flex-1 truncate">
                              {note.title || 'Untitled Note'}
                            </h3>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${
                              note.days_remaining <= 1
                                ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                                : note.days_remaining <= 3
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                            }`}>
                              {note.days_remaining}d
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mb-3 leading-relaxed">
                            {note.content}
                          </p>
                          <div className="flex items-center gap-1.5 text-[10px] text-gray-400 dark:text-gray-500">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>{formatDate(note.updated_at)}</span>
                          </div>
                        </motion.button>
                      ))
                    )}
                  </div>
                </div>

                {/* Note Content/Editor */}
                <div className="flex-1 overflow-y-auto">
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="m-6 mb-0 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-400 rounded-xl text-sm font-medium flex items-center gap-3"
                    >
                      <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      {error}
                    </motion.div>
                  )}

                  {isCreating || isEditing ? (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="p-6 space-y-5"
                    >
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide">
                          Title
                        </label>
                        <input
                          type="text"
                          placeholder="Enter note title..."
                          value={formData.title}
                          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                          className="w-full px-4 py-3.5 text-xl font-bold border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide">
                          Content
                        </label>
                        <textarea
                          placeholder="Write your note here..."
                          value={formData.content}
                          onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                          rows={15}
                          className="w-full px-4 py-3.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 resize-none transition-all leading-relaxed"
                        />
                      </div>

                      {isCreating && (
                        <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
                          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                            Auto-delete after:
                          </label>
                          <select
                            value={formData.days_to_keep}
                            onChange={(e) => setFormData({ ...formData, days_to_keep: parseInt(e.target.value) })}
                            className="px-4 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-medium text-sm transition-all"
                          >
                            <option value={5}>5 days</option>
                            <option value={7}>7 days</option>
                            <option value={14}>14 days</option>
                            <option value={30}>30 days</option>
                          </select>
                        </div>
                      )}

                      <div className="flex gap-3 pt-2">
                        <button
                          onClick={isCreating ? handleCreateNote : handleUpdateNote}
                          disabled={loading || !formData.content.trim()}
                          className="px-8 py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-semibold rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/40 hover:-translate-y-0.5 flex items-center gap-2"
                        >
                          {loading ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                              Saving...
                            </>
                          ) : (
                            <>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              {isCreating ? 'Create Note' : 'Update Note'}
                            </>
                          )}
                        </button>
                        <button
                          onClick={cancelEdit}
                          disabled={loading}
                          className="px-8 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-xl transition-all duration-200 border-2 border-gray-200 dark:border-gray-700"
                        >
                          Cancel
                        </button>
                      </div>
                    </motion.div>
                  ) : selectedNote ? (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="p-6"
                    >
                      <div className="flex items-start justify-between mb-6">
                        <div className="flex-1">
                          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2 leading-tight">
                            {selectedNote.title || 'Untitled Note'}
                          </h1>
                          <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                            <div className="flex items-center gap-1.5">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                              <span>{formatDate(selectedNote.created_at)}</span>
                            </div>
                            <span className="text-gray-300 dark:text-gray-600">•</span>
                            <div className="flex items-center gap-1.5">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              <span>{formatDate(selectedNote.updated_at)}</span>
                            </div>
                            <span className="text-gray-300 dark:text-gray-600">•</span>
                            <div className={`flex items-center gap-1.5 font-semibold ${
                              selectedNote.days_remaining <= 1
                                ? 'text-red-600 dark:text-red-400'
                                : selectedNote.days_remaining <= 3
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                            }`}>
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <span>{selectedNote.days_remaining} days left</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 ml-4">
                          <button
                            onClick={startEditing}
                            className="p-2.5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-xl transition-all duration-200 border-2 border-transparent hover:border-indigo-200 dark:hover:border-indigo-800"
                            title="Edit note"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteNote(selectedNote.note_id)}
                            className="p-2.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl transition-all duration-200 border-2 border-transparent hover:border-red-200 dark:hover:border-red-800"
                            title="Delete note"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      <div className="prose prose-gray dark:prose-invert max-w-none">
                        <div className="p-6 bg-gray-50 dark:bg-gray-800/30 rounded-2xl border border-gray-100 dark:border-gray-800">
                          <p className="whitespace-pre-wrap text-gray-700 dark:text-gray-300 leading-relaxed text-base">
                            {selectedNote.content}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <div className="w-24 h-24 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-indigo-100 via-purple-100 to-pink-100 dark:from-indigo-900/20 dark:via-purple-900/20 dark:to-pink-900/20 flex items-center justify-center shadow-lg">
                          <svg className="w-12 h-12 text-indigo-400 dark:text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No note selected</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Select a note from the list or create a new one</p>
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
