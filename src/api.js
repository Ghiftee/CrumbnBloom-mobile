import * as SecureStore from 'expo-secure-store'
import * as WebBrowser from 'expo-web-browser'

export const API_ORIGIN = (process.env.EXPO_PUBLIC_API_URL || 'https://crumb-and-bloom-production.up.railway.app').replace(/\/$/, '')
const API_BASE = `${API_ORIGIN}/api`
const SESSION_KEY = 'crumb-and-bloom-session'

let sessionToken = ''

export async function restoreSession() {
  sessionToken = await SecureStore.getItemAsync(SESSION_KEY) || ''
  return sessionToken
}

export async function saveSession(token) {
  sessionToken = token || ''
  if (sessionToken) await SecureStore.setItemAsync(SESSION_KEY, sessionToken)
  else await SecureStore.deleteItemAsync(SESSION_KEY)
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      ...options.headers,
    },
    ...options,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'The shop server could not complete that request.')
  return data
}

export async function signInWithGoogle() {
  const result = await WebBrowser.openAuthSessionAsync(
    `${API_BASE}/auth/google?flow=mobile`,
    'crumbandbloom://auth',
  )
  if (result.type !== 'success' || !result.url) {
    throw new Error(result.type === 'cancel' ? 'Google sign-in was cancelled.' : 'Google sign-in did not finish.')
  }
  const code = new URL(result.url).searchParams.get('code')
  if (!code) throw new Error('Google did not return a mobile sign-in code.')
  const session = await request('/auth/mobile/exchange', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
  await saveSession(session.token)
  return session.user
}

export async function signOut() {
  try {
    if (sessionToken) await request('/auth/logout', { method: 'POST' })
  } finally {
    await saveSession('')
  }
}

export const getCurrentUser = () => request('/auth/me')
export const getProducts = () => request('/products')
export const getCart = () => request('/cart')
export const syncCart = (items) => request('/cart', { method: 'PUT', body: JSON.stringify({ items }) })
export const submitOrder = (payload) => request('/orders', { method: 'POST', body: JSON.stringify(payload) })

export function productImageUrl(path) {
  return path?.startsWith('http') ? path : `${API_ORIGIN}${path}`
}

export function connectCartChannel(onCart, onStatus) {
  if (!sessionToken) return () => {}
  let socket
  let reconnectTimer
  let stopped = false

  function connect() {
    onStatus?.('connecting')
    socket = new WebSocket(`${API_BASE.replace(/^http/, 'ws')}/cart/live`, ['crumbandbloom', sessionToken])
    socket.onopen = () => onStatus?.('live')
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        if (message.type === 'cart.updated') onCart(message.items || {})
      } catch {
        // Keep the current basket when an invalid realtime message arrives.
      }
    }
    socket.onerror = () => onStatus?.('offline')
    socket.onclose = () => {
      onStatus?.('offline')
      if (!stopped) reconnectTimer = setTimeout(connect, 1500)
    }
  }

  connect()
  return () => {
    stopped = true
    clearTimeout(reconnectTimer)
    socket?.close()
  }
}
