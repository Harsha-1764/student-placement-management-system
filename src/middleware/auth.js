const { SESSION_COOKIE, hashToken, parseCookies } = require('../auth/session')

function authentication(db) {
  return async (req, res, next) => {
    try {
      const token = parseCookies(req.headers.cookie || '')[SESSION_COOKIE]
      if (!token) return res.status(401).json({ error: 'Authentication required' })
      const [rows] = await db.execute(`
        SELECT u.user_id, u.full_name, u.email, u.account_status, s.session_id,
               GROUP_CONCAT(r.role_name) AS roles
        FROM sessions s
        JOIN users u ON u.user_id = s.user_id
        JOIN user_roles ur ON ur.user_id = u.user_id
        JOIN roles r ON r.role_id = ur.role_id
        WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > UTC_TIMESTAMP()
          AND u.account_status = 'active'
        GROUP BY u.user_id, u.full_name, u.email, u.account_status, s.session_id
      `, [hashToken(token)])
      if (!rows.length) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' })
      req.user = { id: rows[0].user_id, name: rows[0].full_name, email: rows[0].email, roles: rows[0].roles.split(',') }
      req.sessionId = rows[0].session_id
      await db.execute('UPDATE sessions SET last_seen_at = UTC_TIMESTAMP() WHERE session_id = ?', [req.sessionId])
      next()
    } catch (error) { next(error) }
  }
}

function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' })
    if (!req.user.roles.some((role) => allowedRoles.includes(role))) return res.status(403).json({ error: 'You do not have permission to perform this action.' })
    next()
  }
}

module.exports = { authentication, authorize }
