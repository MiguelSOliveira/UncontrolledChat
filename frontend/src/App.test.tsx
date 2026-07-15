import { fireEvent, render, screen, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

const from_passphrase_mock = vi.fn()

vi.mock('./crypto/roomKey', () => ({
  RoomKey: {
    fromPassphrase: from_passphrase_mock,
  },
}))

// ---------------------------------------------------------------------------
// ChatBox mock — exposes an "onMessageReceived" trigger button so sound tests
// can fire the callback from App without touching production code.
// ---------------------------------------------------------------------------
vi.mock('./components/ChatBox', () => ({
  default: ({
    participant,
    onMessageReceived,
  }: {
    participant: { username: string }
    onMessageReceived?: () => void
  }) => (
    <div>
      <h2>Chat screen ready</h2>
      <p>Logged as {participant.username}</p>
      <button onClick={onMessageReceived}>Trigger message received</button>
    </div>
  ),
}))

// ---------------------------------------------------------------------------
// AudioMock — a base class with mocked play / pause.
// Tests that need to inspect a specific instance use CapturingAudioMock below.
// ---------------------------------------------------------------------------
class AudioMock {
  duration = 30
  currentTime = 0
  play = vi.fn().mockResolvedValue(undefined)
  pause = vi.fn()
}

// ---------------------------------------------------------------------------
// CapturingAudioMock — records its own `this` into a module-scoped variable so
// the test can assert on the exact instance created inside App.tsx.
// This avoids the "vi.fn() is not a constructor" problem with arrow functions.
// ---------------------------------------------------------------------------
let capturedAudio: CapturingAudioMock | null = null

class CapturingAudioMock {
  duration = 30
  currentTime = 0
  play = vi.fn().mockResolvedValue(undefined)
  pause = vi.fn()
  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedAudio = this
  }
}

// ---------------------------------------------------------------------------
// Shared helper: bring the app to the chat screen.
// joinChat() must be called AFTER render(<App />) in each test.
// ---------------------------------------------------------------------------
async function joinChat() {
  from_passphrase_mock.mockResolvedValue({ decrypt: vi.fn(), encrypt: vi.fn() })
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: 'p1', username: 'alice' }),
    })
  )

  fireEvent.change(screen.getByPlaceholderText('Your username'), {
    target: { value: 'alice' },
  })
  fireEvent.change(screen.getByPlaceholderText('Room passphrase'), {
    target: { value: 'banana' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Join Chat' }))

  await waitFor(() => {
    expect(screen.getByRole('heading', { name: 'Chat screen ready' })).toBeInTheDocument()
  })
}

// ---------------------------------------------------------------------------
// Existing login-flow tests (unchanged behaviour)
// ---------------------------------------------------------------------------
describe('App login flow', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('shows the login screen by default', async () => {
    vi.stubGlobal('Audio', AudioMock)
    const { default: App } = await import('./App')

    render(<App />)

    expect(screen.getByRole('heading', { name: /UNCONTROLLED CHAT v1\.0\s+\(C\) 2024/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '* ENCRYPTED CHAT *' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Your username')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Room passphrase')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Join Chat' })).toBeInTheDocument()
  })

  it('moves from login screen to chat screen after successful join', async () => {
    vi.stubGlobal('Audio', AudioMock)
    const { default: App } = await import('./App')
    from_passphrase_mock.mockResolvedValue({ decrypt: vi.fn(), encrypt: vi.fn() })

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ id: 'p1', username: 'alice' }),
      })
    )

    render(<App />)

    fireEvent.change(screen.getByPlaceholderText('Your username'), {
      target: { value: 'alice' },
    })
    fireEvent.change(screen.getByPlaceholderText('Room passphrase'), {
      target: { value: 'banana' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Join Chat' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Chat screen ready' })).toBeInTheDocument()
    })
    expect(screen.getByText('Logged as alice')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Sound-toggle button — header presence & label tests
// ---------------------------------------------------------------------------
describe('Sound toggle button — visibility and default state', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('renders a sound-toggle button in the header on the login screen', async () => {
    vi.stubGlobal('Audio', AudioMock)
    const { default: App } = await import('./App')

    render(<App />)

    // The button must be inside the <header> element.
    const header = document.querySelector('header')
    expect(header).not.toBeNull()
    const toggleButton = screen.getByRole('button', { name: /sound/i })
    expect(header).toContainElement(toggleButton)
  })

  it('shows "SOUND ON" label by default (sound is enabled at startup)', async () => {
    vi.stubGlobal('Audio', AudioMock)
    const { default: App } = await import('./App')

    render(<App />)

    // Accept labels like "🔊 SOUND ON" or "SOUND ON" — must contain "ON"
    const toggleButton = screen.getByRole('button', { name: /sound/i })
    expect(toggleButton.textContent).toMatch(/on/i)
    expect(toggleButton.textContent).not.toMatch(/off/i)
  })
})

// ---------------------------------------------------------------------------
// Sound toggle button — label toggling
// ---------------------------------------------------------------------------
describe('Sound toggle button — label toggles on click', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('changes label to "SOUND OFF" after first click', async () => {
    vi.stubGlobal('Audio', AudioMock)
    const { default: App } = await import('./App')
    render(<App />)

    const toggleButton = screen.getByRole('button', { name: /sound/i })
    fireEvent.click(toggleButton)

    expect(toggleButton.textContent).toMatch(/off/i)
    expect(toggleButton.textContent).not.toMatch(/on/i)
  })

  it('toggles back to "SOUND ON" after two clicks (on → off → on)', async () => {
    vi.stubGlobal('Audio', AudioMock)
    const { default: App } = await import('./App')
    render(<App />)

    const toggleButton = screen.getByRole('button', { name: /sound/i })
    fireEvent.click(toggleButton) // → OFF
    fireEvent.click(toggleButton) // → ON

    expect(toggleButton.textContent).toMatch(/on/i)
    expect(toggleButton.textContent).not.toMatch(/off/i)
  })

  it('survives four consecutive toggles and returns to ON', async () => {
    vi.stubGlobal('Audio', AudioMock)
    const { default: App } = await import('./App')
    render(<App />)

    const toggleButton = screen.getByRole('button', { name: /sound/i })

    for (let i = 0; i < 4; i++) {
      fireEvent.click(toggleButton)
    }

    // Four clicks: ON→OFF→ON→OFF→ON
    expect(toggleButton.textContent).toMatch(/on/i)
    expect(toggleButton.textContent).not.toMatch(/off/i)
  })

  it('the sound-toggle button is still present after navigating to chat', async () => {
    vi.stubGlobal('Audio', AudioMock)
    const { default: App } = await import('./App')
    render(<App />)

    await joinChat()

    const header = document.querySelector('header')
    expect(header).not.toBeNull()
    const toggleButton = screen.getByRole('button', { name: /sound/i })
    expect(header).toContainElement(toggleButton)
  })
})

// ---------------------------------------------------------------------------
// Sound behaviour — audio.play is called / not called based on toggle state.
//
// We use CapturingAudioMock (a real class, not vi.fn()) so it is a valid
// constructor when App.tsx calls `new Audio(...)`.  The created instance is
// accessible via the `capturedAudio` closure variable.
//
// vi.useFakeTimers({ shouldAdvanceTime: true }) lets real-time callbacks
// (like waitFor's polling) still fire while synthetic setTimeout calls in
// App.tsx (the 2-second loading timer) are under test control.
// ---------------------------------------------------------------------------
describe('Sound toggle button — audio.play behaviour', () => {
  beforeEach(() => {
    capturedAudio = null
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.resetModules()
    capturedAudio = null
  })

  it('calls audio.play when sound is ON (default) and onMessageReceived fires', async () => {
    vi.stubGlobal('Audio', CapturingAudioMock)
    const { default: App } = await import('./App')
    render(<App />)
    await joinChat()

    fireEvent.click(screen.getByRole('button', { name: /trigger message received/i }))

    expect(capturedAudio!.play).toHaveBeenCalledTimes(1)
  })

  it('does NOT call audio.play when sound is OFF and onMessageReceived fires', async () => {
    vi.stubGlobal('Audio', CapturingAudioMock)
    const { default: App } = await import('./App')
    render(<App />)
    await joinChat()

    // Disable sound first
    fireEvent.click(screen.getByRole('button', { name: /sound/i }))

    fireEvent.click(screen.getByRole('button', { name: /trigger message received/i }))

    expect(capturedAudio!.play).not.toHaveBeenCalled()
  })

  it('resumes playing after toggling sound back ON', async () => {
    vi.stubGlobal('Audio', CapturingAudioMock)
    const { default: App } = await import('./App')
    render(<App />)
    await joinChat()

    const soundToggle = screen.getByRole('button', { name: /sound/i })
    const triggerBtn = screen.getByRole('button', { name: /trigger message received/i })

    // OFF — no play
    fireEvent.click(soundToggle)
    fireEvent.click(triggerBtn)
    expect(capturedAudio!.play).not.toHaveBeenCalled()

    // ON — play fires
    fireEvent.click(soundToggle)
    fireEvent.click(triggerBtn)
    expect(capturedAudio!.play).toHaveBeenCalledTimes(1)
  })

  it('does NOT call audio.play on the second trigger when toggled OFF between calls', async () => {
    vi.stubGlobal('Audio', CapturingAudioMock)
    const { default: App } = await import('./App')
    render(<App />)
    await joinChat()

    const soundToggle = screen.getByRole('button', { name: /sound/i })
    const triggerBtn = screen.getByRole('button', { name: /trigger message received/i })

    // First trigger while sound is ON
    fireEvent.click(triggerBtn)
    expect(capturedAudio!.play).toHaveBeenCalledTimes(1)

    // Toggle OFF, second trigger must not add another play call
    fireEvent.click(soundToggle)
    fireEvent.click(triggerBtn)
    expect(capturedAudio!.play).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Loading state is independent of sound toggle
// ---------------------------------------------------------------------------
describe('Loading state fires regardless of sound toggle', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('adds "loading" CSS class to root element when sound is ON', async () => {
    vi.stubGlobal('Audio', AudioMock)
    const { default: App } = await import('./App')
    render(<App />)
    await joinChat()

    const root = document.querySelector('.spectrum-border')
    expect(root).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /trigger message received/i }))

    expect(root!.classList).toContain('loading')
  })

  it('adds "loading" CSS class to root element even when sound is OFF', async () => {
    vi.stubGlobal('Audio', AudioMock)
    const { default: App } = await import('./App')
    render(<App />)
    await joinChat()

    // Disable sound
    fireEvent.click(screen.getByRole('button', { name: /sound/i }))

    const root = document.querySelector('.spectrum-border')
    expect(root).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /trigger message received/i }))

    // Loading class must still appear even though sound is muted
    expect(root!.classList).toContain('loading')
  })

  it('removes "loading" CSS class after the 2-second timeout', async () => {
    vi.stubGlobal('Audio', AudioMock)
    const { default: App } = await import('./App')
    render(<App />)
    await joinChat()

    const root = document.querySelector('.spectrum-border')!

    fireEvent.click(screen.getByRole('button', { name: /trigger message received/i }))
    expect(root.classList).toContain('loading')

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(root.classList).not.toContain('loading')
  })

  it('removes "loading" CSS class after 2 seconds even when sound is OFF', async () => {
    vi.stubGlobal('Audio', AudioMock)
    const { default: App } = await import('./App')
    render(<App />)
    await joinChat()

    fireEvent.click(screen.getByRole('button', { name: /sound/i })) // disable sound

    const root = document.querySelector('.spectrum-border')!

    fireEvent.click(screen.getByRole('button', { name: /trigger message received/i }))
    expect(root.classList).toContain('loading')

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(root.classList).not.toContain('loading')
  })
})
