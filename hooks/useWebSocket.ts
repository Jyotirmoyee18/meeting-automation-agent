import { useRef, useState, useCallback, useEffect } from 'react';
import {
  ConnectionState,
  WsServerMessage,
  WsMeetingStartMsg,
  WsMeetingStopMsg,
  WsMeetingPauseMsg,
  WsMeetingResumeMsg,
} from '../types';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:3001/ws';

type MessageHandler = (msg: WsServerMessage) => void;

interface UseWebSocketReturn {
  connectionState: ConnectionState;
  connect: () => void;
  disconnect: () => void;
  sendJson: (msg: object) => void;
  sendBinary: (data: ArrayBuffer | Blob) => void;
  onMessage: (handler: MessageHandler) => () => void;
  isConnected: boolean;
}

export function useWebSocket(): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Set<MessageHandler>>(new Set());
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unmountedRef = useRef(false);

  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');

  const clearReconnect = () => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  };

  const clearPing = () => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  };

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
    }
    clearReconnect();
    if (unmountedRef.current) return;

    setConnectionState('connecting');
    const ws = new WebSocket(WS_URL);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmountedRef.current) { ws.close(); return; }
      setConnectionState('connected');
      // Keep-alive ping
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'client:ping' }));
        }
      }, 20000);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as WsServerMessage;
        handlersRef.current.forEach(h => h(msg));
      } catch {
        // ignore parse errors
      }
    };

    ws.onerror = (err) => {
      console.error('[WS] Error:', err);
    };

    ws.onclose = () => {
      clearPing();
      if (unmountedRef.current) return;
      setConnectionState(prev => {
        // Don't override terminal states
        if (prev === 'completed' || prev === 'error') return prev;
        return 'idle';
      });
    };
  }, []);

  const disconnect = useCallback(() => {
    clearReconnect();
    clearPing();
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    if (!unmountedRef.current) {
      setConnectionState('idle');
    }
  }, []);

  const sendJson = useCallback((msg: object) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const sendBinary = useCallback((data: ArrayBuffer | Blob) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }, []);

  const onMessage = useCallback((handler: MessageHandler): (() => void) => {
    handlersRef.current.add(handler);
    return () => handlersRef.current.delete(handler);
  }, []);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      clearReconnect();
      clearPing();
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, []);

  return {
    connectionState,
    connect,
    disconnect,
    sendJson,
    sendBinary,
    onMessage,
    isConnected: connectionState !== 'idle' && connectionState !== 'error',
  };
}
