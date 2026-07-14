import { useEffect, useRef, useState } from 'react'
import './ChatInput.css'
import {
  ACCEPTED_MIME,
  MAX_MEDIA_BYTES,
  formatBytes,
  isAcceptedFile
} from '../media/media'

interface ChatInputProps {
  onSendMessage: (message: string) => void
  onSendMedia: (file: File, caption: string) => Promise<void>
  disabled?: boolean
  pendingFile: File | null
  onPendingFileChange: (file: File | null) => void
}

export default function ChatInput({
  onSendMessage,
  onSendMedia,
  disabled,
  pendingFile,
  onPendingFileChange
}: ChatInputProps) {
  const [message, setMessage] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!pendingFile) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(pendingFile)
    setPreviewUrl(url)

    return () => URL.revokeObjectURL(url)
  }, [pendingFile])

  const handleFilePicked = (file: File | undefined | null) => {
    setError(null)
    if (!file) return
    if (!isAcceptedFile(file)) {
      setError('Only image and video files are supported')
      return
    }
    if (file.size > MAX_MEDIA_BYTES) {
      setError(`File is too large (max ${formatBytes(MAX_MEDIA_BYTES)})`)
      return
    }
    onPendingFileChange(file)
  }

  const clearPending = () => {
    onPendingFileChange(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (disabled || sending) return

    if (pendingFile) {
      setSending(true)
      try {
        await onSendMedia(pendingFile, message.trim())
        setMessage('')
        clearPending()
      } catch (err) {
        console.error('Failed to send media:', err)
        setError('Failed to send media')
      } finally {
        setSending(false)
      }
      return
    }

    if (message.trim()) {
      onSendMessage(message)
      setMessage('')
      textInputRef.current?.focus()
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as unknown as React.FormEvent)
    }
  }

  const canSend = !disabled && !sending && (pendingFile || message.trim())

  return (
    <form className="chat-input-wrapper" onSubmit={handleSubmit}>
      {error && <div className="chat-input-error">{error}</div>}
      {pendingFile && previewUrl && (
        <div className="chat-input-preview">
          {pendingFile.type.startsWith('image/') ? (
            <img src={previewUrl} alt={pendingFile.name} />
          ) : (
            <video src={previewUrl} muted />
          )}
          <div className="chat-input-preview-meta">
            <div className="chat-input-preview-name">{pendingFile.name}</div>
            <div className="chat-input-preview-size">
              {formatBytes(pendingFile.size)}
            </div>
          </div>
          <button
            type="button"
            className="chat-input-preview-remove"
            onClick={clearPending}
            aria-label="Remove attachment"
          >
            ✕
          </button>
        </div>
      )}
      <div className="chat-input">
        <button
          type="button"
          className="chat-input-attach"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || sending}
          aria-label="Attach image or video"
          title="Attach image or video"
        >
          📎
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_MIME}
          hidden
          onChange={(e) => handleFilePicked(e.target.files?.[0])}
        />
        <span className="chat-input-prompt">&#62;</span>
        <input
          ref={textInputRef}
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={pendingFile ? 'add a caption...' : 'type here...'}
          disabled={disabled || sending}
          autoComplete="off"
          autoFocus
        />
        <button type="submit" disabled={!canSend}>
          {sending ? '...' : 'SEND'}
        </button>
      </div>
    </form>
  )
}
