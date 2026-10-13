function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 10 } = {}) {
  const attempts = new Map()
  return (req, res, next) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown'
    const now = Date.now()
    const current = attempts.get(key)
    if (!current || current.resetAt <= now) attempts.set(key, { count: 1, resetAt: now + windowMs })
    else current.count += 1
    const entry = attempts.get(key)
    if (entry.count > max) return res.status(429).json({ error: 'Too many attempts. Please try again later.' })
    next()
  }
}

module.exports = { createRateLimiter }
