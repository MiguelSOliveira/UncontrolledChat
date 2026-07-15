import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

import ChatInput from './ChatInput'

describe('ChatInput', () => {
  it('renders composer baseline UI and keeps send disabled when empty', () => {
    render(
      <ChatInput
        onSendMessage={vi.fn()}
        onSendMedia={vi.fn().mockResolvedValue(undefined)}
        pendingFile={null}
        onPendingFileChange={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'Attach image or video' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('type here...')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'SEND' })).toBeDisabled()
  })

  it('sends a text message and clears the input', async () => {
    const on_send_message = vi.fn()
    const user = userEvent.setup()

    render(
      <ChatInput
        onSendMessage={on_send_message}
        onSendMedia={vi.fn().mockResolvedValue(undefined)}
        pendingFile={null}
        onPendingFileChange={vi.fn()}
      />
    )

    const input = screen.getByPlaceholderText('type here...')
    await user.type(input, 'hello world')
    await user.click(screen.getByRole('button', { name: 'SEND' }))

    expect(on_send_message).toHaveBeenCalledWith('hello world')
    expect(input).toHaveValue('')
  })

  it('shows attachment preview metadata and remove button when pending file exists', async () => {
    const create_object_url = vi.fn(() => 'blob:preview')
    const revoke_object_url = vi.fn()
    vi.stubGlobal('URL', {
      createObjectURL: create_object_url,
      revokeObjectURL: revoke_object_url,
    })

    const file = new File(['x'], 'photo.png', { type: 'image/png' })
    const on_pending_file_change = vi.fn()

    const { unmount } = render(
      <ChatInput
        onSendMessage={vi.fn()}
        onSendMedia={vi.fn().mockResolvedValue(undefined)}
        pendingFile={file}
        onPendingFileChange={on_pending_file_change}
      />
    )

    expect(screen.getByText('photo.png')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove attachment' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remove attachment' }))
    expect(on_pending_file_change).toHaveBeenCalledWith(null)

    unmount()
    await waitFor(() => {
      expect(revoke_object_url).toHaveBeenCalled()
    })
  })
})
