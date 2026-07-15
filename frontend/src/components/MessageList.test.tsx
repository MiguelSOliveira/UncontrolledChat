import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

import MessageList, { ChatMessage } from './MessageList'

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

describe('MessageList', () => {
  it('renders joined/left system events with expected terminal-style wording', () => {
    const messages: ChatMessage[] = [
      { type: 'user_joined', username: 'alice', user_id: 'u1' },
      { type: 'user_left', username: 'bob', user_id: 'u2' },
    ]

    render(<MessageList messages={messages} />)

    expect(screen.getByText('*** ALICE HAS JOINED THE CHANNEL')).toBeInTheDocument()
    expect(screen.getByText('*** BOB HAS LEFT THE CHANNEL')).toBeInTheDocument()
  })

  it('renders regular text messages with uppercase nick and content', () => {
    const messages: ChatMessage[] = [
      {
        id: 'm1',
        content: 'hello everyone',
        user_id: 'u1',
        username: 'alice',
      },
    ]

    render(<MessageList messages={messages} />)

    expect(screen.getByText('<ALICE>')).toBeInTheDocument()
    expect(screen.getByText('hello everyone')).toBeInTheDocument()
  })

  it('renders failed media decryption marker', () => {
    const messages: ChatMessage[] = [
      {
        id: 'm2',
        user_id: 'u1',
        username: 'alice',
        kind: 'media',
        media: { failed: true },
      },
    ]

    render(<MessageList messages={messages} />)

    expect(
      screen.getByText('*** ENCRYPTED MEDIA — WRONG PASSPHRASE ***')
    ).toBeInTheDocument()
  })
})
