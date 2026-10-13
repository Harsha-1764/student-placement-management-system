const bcrypt = require('bcryptjs')
const crypto = require('node:crypto')
const { appendCookie, clearSessionCookie, cookieOptions, createSessionToken, hashToken, parseCookies, SESSION_COOKIE, sessionExpiresAt } = require('../auth/session')
const { createRateLimiter } = require('../middleware/rateLimit')
const { authentication } = require('../middleware/auth')

function normalizeEmail(email) { return String(email || '').trim().toLowerCase() }

function safeUser(row, roles = []) { return { id: row.user_id, name: row.full_name, email: row.email, roles } }

module.exports = function authRoutes({ app, db }) {
  const loginLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10 })
  const resetLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5 })

  app.post('/api/auth/login', loginLimiter, async (req, res, next) => {
    try {
      const email = normalizeEmail(req.body.email)
      const password = String(req.body.password || '')
      const remember = req.body.remember === true
      if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' })
      const [rows] = await db.execute(`
        SELECT u.user_id, u.full_name, u.email, u.password_hash
        FROM users u WHERE u.email = ? AND u.account_status = 'active'
      `, [email])
      const user = rows[0]
      const valid = user ? await bcrypt.compare(password, user.password_hash) : false
      if (!valid) return res.status(401).json({ error: 'Invalid email or password.' })
      const [roleRows] = await db.execute(`SELECT r.role_name FROM roles r JOIN user_roles ur ON ur.role_id = r.role_id WHERE ur.user_id = ?`, [user.user_id])
      const roles = roleRows.map((row) => row.role_name)
      if (!roles.length) return res.status(403).json({ error: 'This account is not assigned a role.' })
      const { rawToken, tokenHash } = createSessionToken()
      const expiresAt = sessionExpiresAt(remember)
      await db.execute('INSERT INTO sessions (user_id, token_hash, expires_at, user_agent, ip_address) VALUES (?, ?, ?, ?, ?)', [user.user_id, tokenHash, expiresAt, req.get('user-agent')?.slice(0, 255) || null, req.ip?.slice(0, 64) || null])
      await db.execute('UPDATE users SET last_login_at = UTC_TIMESTAMP() WHERE user_id = ?', [user.user_id])
      appendCookie(res, SESSION_COOKIE, rawToken, cookieOptions(remember))
      res.json({ user: safeUser(user, roles) })
    } catch (error) { next(error) }
  })

  app.get('/api/auth/me', authentication(db), (req, res) => res.json({ user: req.user }))

  app.post('/api/auth/logout', async (req, res, next) => {
    try {
      const token = parseCookies(req.headers.cookie || '')[SESSION_COOKIE]
      if (token) await db.execute('UPDATE sessions SET revoked_at = UTC_TIMESTAMP() WHERE token_hash = ?', [hashToken(token)])
      clearSessionCookie(res)
      res.json({ message: 'Signed out' })
    } catch (error) { next(error) }
  })

  app.post('/api/auth/password-reset/request', resetLimiter, async (req, res, next) => {
    try {
      const email = normalizeEmail(req.body.email)
      const genericResponse = { message: 'If an active account matches that email, password recovery instructions will be sent.' }
      if (!email || !email.includes('@')) return res.json(genericResponse)
      const [users] = await db.execute("SELECT user_id FROM users WHERE email = ? AND account_status = 'active'", [email])
      if (users.length) {
        const rawToken = crypto.randomBytes(32).toString('base64url')
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
        await db.execute('INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 MINUTE))', [users[0].user_id, tokenHash])
        // A configured mail adapter should deliver rawToken. It is intentionally never returned or logged here.
      }
      res.json(genericResponse)
    } catch (error) { next(error) }
  })

  app.post('/api/auth/password-reset/confirm', resetLimiter, async (req, res, next) => {
    try {
      const token = String(req.body.token || '')
      const password = String(req.body.password || '')
      if (token.length < 20 || password.length < 12) return res.status(400).json({ error: 'A valid reset token and a password of at least 12 characters are required.' })
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
      const connection = await db.getConnection()
      try {
        await connection.beginTransaction()
        const [rows] = await connection.execute('SELECT reset_id, user_id FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP() FOR UPDATE', [tokenHash])
        if (!rows.length) { await connection.rollback(); return res.status(400).json({ error: 'This reset link is invalid or has expired.' }) }
        const passwordHash = await bcrypt.hash(password, 12)
        await connection.execute('UPDATE users SET password_hash = ?, updated_at = UTC_TIMESTAMP() WHERE user_id = ?', [passwordHash, rows[0].user_id])
        await connection.execute('UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP() WHERE reset_id = ?', [rows[0].reset_id])
        await connection.execute('UPDATE sessions SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ?', [rows[0].user_id])
        await connection.commit()
        res.json({ message: 'Password updated. Please sign in again.' })
      } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
    } catch (error) { next(error) }
  })
}
