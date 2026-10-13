const crypto = require('node:crypto')

const SESSION_COOKIE = 'placement_session'
const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS) || 8
const REMEMBER_ME_DAYS = Number(process.env.REMEMBER_ME_DAYS) || 30

function createSessionToken() {
  const rawToken = crypto.randomBytes(32).toString('base64url')
  return { rawToken, tokenHash: crypto.createHash('sha256').update(rawToken).digest('hex') }
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function sessionExpiresAt(remember = false) {
  return new Date(Date.now() + (remember ? REMEMBER_ME_DAYS * 24 * 60 * 60 * 1000 : SESSION_TTL_HOURS * 60 * 60 * 1000))
}

function cookieOptions(remember = false) {
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.COOKIE_SAME_SITE || 'lax',
    path: '/',
  }
  if (remember) options.maxAge = REMEMBER_ME_DAYS * 24 * 60 * 60 * 1000
  return options
}

function parseCookies(header = '') {
  return header.split(';').reduce((cookies, part) => {
    const separator = part.indexOf('=')
    if (separator < 0) return cookies
    const key = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()
    cookies[key] = decodeURIComponent(value)
    return cookies
  }, {})
}

function appendCookie(res, name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path || '/'}`]
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge / 1000)}`)
  if (options.httpOnly) parts.push('HttpOnly')
  if (options.secure) parts.push('Secure')
  if (options.sameSite) parts.push(`SameSite=${options.sameSite[0].toUpperCase()}${options.sameSite.slice(1).toLowerCase()}`)
  const existing = res.getHeader('Set-Cookie')
  res.setHeader('Set-Cookie', [...(existing ? (Array.isArray(existing) ? existing : [existing]) : []), parts.join('; ')])
}

function clearSessionCookie(res) { appendCookie(res, SESSION_COOKIE, '', { ...cookieOptions(), maxAge: 0 }) }

module.exports = { SESSION_COOKIE, cookieOptions, clearSessionCookie, createSessionToken, hashToken, parseCookies, sessionExpiresAt, appendCookie }
