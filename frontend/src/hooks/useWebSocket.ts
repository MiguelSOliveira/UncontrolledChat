import { useEffect, useRef, useState } from 'react'

interface UseWebSocketReturn {
  ws: WebSocket | null
  isConnected: boolean
}

export function useWebSocket(
  userId: string,
  onMessage: (msg: any) => void
): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null)
  const onMessageRef = useRef(onMessage)
  const [isConnected, setIsConnected] = useState(false)

  // Keep the latest onMessage without retriggering the effect
  useEffect(() => {
    onMessageRef.current = onMessage
  }, [onMessage])

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const wsUrl = `${protocol}://${window.location.host}/ws/${userId}`

    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      console.log('WebSocket connected')
      setIsConnected(true)
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        onMessageRef.current(data)
      } catch (err) {
        console.error('Failed to parse message:', err)
      }
    }

    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
      setIsConnected(false)
    }

    ws.onclose = () => {
      console.log('WebSocket disconnected')
      setIsConnected(false)
    }

    wsRef.current = ws

    return () => {
      ws.close()
    }
  }, [userId])

  return {
    ws: wsRef.current,
    isConnected
  }
}
