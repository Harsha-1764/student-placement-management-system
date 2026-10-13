const path = require('node:path')
const express = require('express')
const cors = require('cors')
const bcrypt = require('bcryptjs')
require('dotenv').config()

const db = require('./src/config/db')
const { authentication, authorize } = require('./src/middleware/auth')
const authRoutes = require('./src/routes/auth')

const app = express()
const allowedOrigins = (process.env.FRONTEND_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map((origin) => origin.trim()).filter(Boolean)

app.use(cors({ origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin)), credentials: true }))
app.use(express.json({ limit: '100kb' }))

app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  const origin = req.get('origin')
  if (origin && !allowedOrigins.includes(origin)) return res.status(403).json({ error: 'Request origin is not allowed.' })
  next()
})

const STATUS_VALUES = ['Applied', 'Shortlisted', 'Rejected', 'Selected']
const canManage = authorize('admin', 'coordinator')

function text(value) { return value === undefined || value === null ? '' : String(value).trim() }
function optional(value) { const normalized = text(value); return normalized || null }
function numberOrNull(value) { return value === '' || value === undefined || value === null ? null : Number(value) }
function parseId(value) { return /^[0-9]+$/.test(String(value)) ? Number(value) : null }
function normalizeStatus(value) {
  const normalized = text(value).toLowerCase()
  const aliases = { applied: 'Applied', pending: 'Applied', shortlisted: 'Shortlisted', rejected: 'Rejected', selected: 'Selected' }
  return aliases[normalized] || null
}
function isValidEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) }
function isStrongPassword(value) { return typeof value === 'string' && value.length >= 12 }
function dateOnly(value) {
  const normalized = String(value || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null
  const [year, month, day] = normalized.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? normalized : null
}
function serializeStudent(row) { return { ...row, id: row.student_id } }
function serializeCompany(row) { return { ...row, id: row.company_id, name: row.company_name } }
function serializeJob(row) { return { ...row, id: row.job_id, role: row.job_role, packageLpa: row.package_lpa, minCgpa: row.min_cgpa, location: row.job_location } }
function serializeApplication(row) { return { ...row, id: row.application_id, student_email: row.email, job_location: row.job_location, role: row.job_role, company: row.company_name } }

function validationError(res, message) { return res.status(400).json({ error: message }) }

app.get('/', (req, res) => res.json({ message: 'Student Placement Management API is running' }))
app.get('/api/health', async (req, res, next) => {
  try { await db.query('SELECT 1'); res.json({ status: 'ok', database: 'connected' }) } catch (error) { next(error) }
})

authRoutes({ app, db })

app.get('/api/users', authentication(db), authorize('admin'), async (req, res, next) => {
  try {
    const [rows] = await db.query(`SELECT u.user_id, u.full_name, u.email, u.account_status, u.created_at, u.last_login_at, GROUP_CONCAT(r.role_name) AS roles FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.user_id LEFT JOIN roles r ON r.role_id = ur.role_id GROUP BY u.user_id ORDER BY u.user_id DESC`)
    res.json(rows.map((row) => ({ id: row.user_id, name: row.full_name, email: row.email, status: row.account_status, createdAt: row.created_at, lastLoginAt: row.last_login_at, roles: row.roles ? row.roles.split(',') : [] })))
  } catch (error) { next(error) }
})

app.post('/api/users', authentication(db), authorize('admin'), async (req, res, next) => {
  try {
    const name = text(req.body.name), email = optional(req.body.email)?.toLowerCase(), password = String(req.body.password || ''), role = text(req.body.role || 'viewer').toLowerCase()
    if (!name || !email || !isValidEmail(email) || !isStrongPassword(password)) return validationError(res, 'Name, a valid email, and a password of at least 12 characters are required')
    if (!['admin', 'coordinator', 'viewer'].includes(role)) return validationError(res, 'Invalid account role')
    const passwordHash = await bcrypt.hash(password, 12)
    const connection = await db.getConnection()
    try {
      await connection.beginTransaction()
      const [result] = await connection.execute('INSERT INTO users (full_name, email, password_hash) VALUES (?, ?, ?)', [name, email, passwordHash])
      const [[roleRow]] = await connection.execute('SELECT role_id FROM roles WHERE role_name = ?', [role])
      await connection.execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [result.insertId, roleRow.role_id])
      await connection.commit()
      res.status(201).json({ message: 'User created', id: result.insertId })
    } catch (error) { await connection.rollback(); if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'This email is already registered' }); throw error } finally { connection.release() }
  } catch (error) { next(error) }
})

app.patch('/api/users/:id/role', authentication(db), authorize('admin'), async (req, res, next) => {
  try {
    const id = parseId(req.params.id), role = text(req.body.role).toLowerCase()
    if (!id || !['admin', 'coordinator', 'viewer'].includes(role)) return validationError(res, 'Invalid account role')
    const connection = await db.getConnection()
    try {
      await connection.beginTransaction()
      const [[target]] = await connection.execute('SELECT user_id, account_status FROM users WHERE user_id = ? FOR UPDATE', [id])
      if (!target) { await connection.rollback(); return res.status(404).json({ error: 'User not found' }) }
      const [[currentRole]] = await connection.execute(`SELECT r.role_name FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id WHERE ur.user_id = ? FOR UPDATE`, [id])
      const [[roleRow]] = await connection.execute('SELECT role_id FROM roles WHERE role_name = ?', [role])
      if (!roleRow) { await connection.rollback(); return validationError(res, 'The requested role is not configured') }
      if (currentRole?.role_name === 'admin' && role !== 'admin') {
        const [[adminCount]] = await connection.execute(`SELECT COUNT(DISTINCT u.user_id) AS total FROM users u JOIN user_roles ur ON ur.user_id = u.user_id JOIN roles r ON r.role_id = ur.role_id WHERE r.role_name = 'admin' AND u.account_status = 'active'`)
        if (Number(adminCount.total) <= 1) { await connection.rollback(); return validationError(res, 'The last active administrator cannot be demoted') }
      }
      await connection.execute('DELETE FROM user_roles WHERE user_id = ?', [id])
      await connection.execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [id, roleRow.role_id])
      await connection.commit()
      res.json({ message: 'User role updated' })
    } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
  } catch (error) { next(error) }
})

app.patch('/api/users/:id/status', authentication(db), authorize('admin'), async (req, res, next) => {
  try {
    const id = parseId(req.params.id), status = text(req.body.status).toLowerCase()
    if (!id || !['active', 'suspended'].includes(status)) return validationError(res, 'Invalid account status')
    if (id === req.user.id && status !== 'active') return validationError(res, 'You cannot suspend your own account')
    const connection = await db.getConnection()
    try {
      await connection.beginTransaction()
      const [[target]] = await connection.execute('SELECT user_id, account_status FROM users WHERE user_id = ? FOR UPDATE', [id])
      if (!target) { await connection.rollback(); return res.status(404).json({ error: 'User not found' }) }
      if (target.account_status === 'active' && status === 'suspended') {
        const [[currentRole]] = await connection.execute(`SELECT r.role_name FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id WHERE ur.user_id = ? FOR UPDATE`, [id])
        if (currentRole?.role_name === 'admin') {
          const [[adminCount]] = await connection.execute(`SELECT COUNT(DISTINCT u.user_id) AS total FROM users u JOIN user_roles ur ON ur.user_id = u.user_id JOIN roles r ON r.role_id = ur.role_id WHERE r.role_name = 'admin' AND u.account_status = 'active'`)
          if (Number(adminCount.total) <= 1) { await connection.rollback(); return validationError(res, 'The last active administrator cannot be suspended') }
        }
      }
      await connection.execute('UPDATE users SET account_status = ? WHERE user_id = ?', [status, id])
      if (status === 'suspended') await connection.execute('UPDATE sessions SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ?', [id])
      await connection.commit()
      res.json({ message: 'User status updated' })
    } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
  } catch (error) { next(error) }
})

app.get('/api/dashboard/stats', authentication(db), async (req, res, next) => {
  try {
    const [[counts]] = await db.query(`SELECT (SELECT COUNT(*) FROM students) AS students, (SELECT COUNT(*) FROM companies) AS companies, (SELECT COUNT(*) FROM jobs WHERE deadline IS NULL OR deadline >= CURDATE()) AS jobs, (SELECT COUNT(*) FROM jobs) AS all_jobs, (SELECT COUNT(*) FROM applications) AS applications`)
    const [statusRows] = await db.query(`SELECT status, COUNT(*) AS total FROM applications GROUP BY status ORDER BY status`)
    const [[outcomes]] = await db.query(`SELECT COUNT(DISTINCT CASE WHEN a.status = 'Selected' THEN a.student_id END) AS placed_students, COUNT(CASE WHEN a.status IN ('Applied', 'Shortlisted') THEN 1 END) AS in_process_applications FROM applications a`)
    const [[upcoming]] = await db.query(`SELECT COUNT(*) AS upcoming_deadlines FROM jobs WHERE deadline IS NOT NULL AND deadline >= CURDATE()`)
    const [[unplaced]] = await db.query(`SELECT COUNT(*) AS total FROM students s WHERE NOT EXISTS (SELECT 1 FROM applications a WHERE a.student_id = s.student_id AND a.status = 'Selected')`)
    const placementRate = Number(counts.students) ? Number(((Number(outcomes.placed_students) / Number(counts.students)) * 100).toFixed(1)) : null
    const [recentActivity] = await db.query(`
      SELECT 'application' AS activity_type, a.application_id AS id, CONCAT(s.name, ' applied to ', j.job_role) AS description, a.status, a.application_date AS activity_date, c.company_name
      FROM applications a JOIN students s ON s.student_id = a.student_id JOIN jobs j ON j.job_id = a.job_id JOIN companies c ON c.company_id = j.company_id
      ORDER BY a.application_date DESC, a.application_id DESC LIMIT 8
    `)
    res.json({
      students: Number(counts.students), companies: Number(counts.companies), jobs: Number(counts.jobs), allJobs: Number(counts.all_jobs), applications: Number(counts.applications),
      totalStudents: Number(counts.students), totalCompanies: Number(counts.companies), totalJobs: Number(counts.jobs), totalApplications: Number(counts.applications),
      placedStudents: Number(outcomes.placed_students), inProcessApplications: Number(outcomes.in_process_applications), unplacedStudents: Number(unplaced.total), placementRate,
      upcomingDeadlines: Number(upcoming.upcoming_deadlines), statuses: statusRows, statusCounts: Object.fromEntries(statusRows.map((row) => [row.status, Number(row.total)])), recentActivity,
    })
  } catch (error) { next(error) }
})

app.get('/api/students', authentication(db), async (req, res, next) => {
  try { const [rows] = await db.query('SELECT student_id, name, email, branch, cgpa FROM students ORDER BY student_id DESC'); res.json(rows.map(serializeStudent)) } catch (error) { next(error) }
})

app.post('/api/students', authentication(db), canManage, async (req, res, next) => {
  try {
    const name = text(req.body.name), email = optional(req.body.email)?.toLowerCase() || null, branch = optional(req.body.branch), cgpa = numberOrNull(req.body.cgpa)
    if (!name) return validationError(res, 'Student name is required')
    if (email && !isValidEmail(email)) return validationError(res, 'Enter a valid email address')
    if (cgpa !== null && (!Number.isFinite(cgpa) || cgpa < 0 || cgpa > 10)) return validationError(res, 'CGPA must be between 0 and 10')
    const [result] = await db.execute('INSERT INTO students (name, email, branch, cgpa) VALUES (?, ?, ?, ?)', [name, email, branch, cgpa])
    res.status(201).json({ message: 'Student created', student_id: result.insertId, id: result.insertId })
  } catch (error) { if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'This email is already registered' }); next(error) }
})

app.put('/api/students/:id', authentication(db), canManage, async (req, res, next) => {
  try {
    const id = parseId(req.params.id), name = text(req.body.name), email = optional(req.body.email)?.toLowerCase() || null, branch = optional(req.body.branch), cgpa = numberOrNull(req.body.cgpa)
    if (!id) return validationError(res, 'Student id is invalid')
    if (!name) return validationError(res, 'Student name is required')
    if (email && !isValidEmail(email)) return validationError(res, 'Enter a valid email address')
    if (cgpa !== null && (!Number.isFinite(cgpa) || cgpa < 0 || cgpa > 10)) return validationError(res, 'CGPA must be between 0 and 10')
    const [result] = await db.execute('UPDATE students SET name=?, email=?, branch=?, cgpa=? WHERE student_id=?', [name, email, branch, cgpa, id])
    if (!result.affectedRows) { const [exists] = await db.execute('SELECT student_id FROM students WHERE student_id=?', [id]); if (!exists.length) return res.status(404).json({ error: 'Student not found' }) }
    res.json({ message: 'Student updated', student_id: id, id })
  } catch (error) { if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'This email is already registered' }); next(error) }
})

app.get('/api/companies', authentication(db), async (req, res, next) => {
  try { const [rows] = await db.query('SELECT company_id, company_name, industry, location, website FROM companies ORDER BY company_id DESC'); res.json(rows.map(serializeCompany)) } catch (error) { next(error) }
})

app.post('/api/companies', authentication(db), canManage, async (req, res, next) => {
  try {
    const companyName = text(req.body.company_name ?? req.body.name)
    if (!companyName) return validationError(res, 'Company name is required')
    const [result] = await db.execute('INSERT INTO companies (company_name, industry, location, website) VALUES (?, ?, ?, ?)', [companyName, optional(req.body.industry), optional(req.body.location), optional(req.body.website)])
    res.status(201).json({ message: 'Company created', company_id: result.insertId, id: result.insertId })
  } catch (error) { next(error) }
})

app.get('/api/jobs', authentication(db), async (req, res, next) => {
  try { const [rows] = await db.query(`SELECT j.job_id, j.company_id, j.job_role, j.package_lpa, j.min_cgpa, j.job_location, j.deadline, c.company_name FROM jobs j JOIN companies c ON c.company_id = j.company_id ORDER BY j.job_id DESC`); res.json(rows.map(serializeJob)) } catch (error) { next(error) }
})

app.post('/api/jobs', authentication(db), canManage, async (req, res, next) => {
  try {
    const companyId = parseId(req.body.company_id ?? req.body.companyId), jobRole = text(req.body.job_role ?? req.body.role ?? req.body.title), packageLpa = numberOrNull(req.body.package_lpa ?? req.body.packageLpa), minCgpa = numberOrNull(req.body.min_cgpa ?? req.body.minCgpa), jobLocation = optional(req.body.job_location ?? req.body.location), rawDeadline = req.body.deadline, deadline = rawDeadline ? dateOnly(rawDeadline) : null
    if (!companyId || !jobRole) return validationError(res, 'Company and job role are required')
    if (packageLpa !== null && (!Number.isFinite(packageLpa) || packageLpa < 0 || packageLpa > 999.99)) return validationError(res, 'Invalid salary package')
    if (minCgpa !== null && (!Number.isFinite(minCgpa) || minCgpa < 0 || minCgpa > 10)) return validationError(res, 'Minimum CGPA must be between 0 and 10')
    if (rawDeadline && !deadline) return validationError(res, 'Deadline must be a valid calendar date in YYYY-MM-DD format')
    const [result] = await db.execute('INSERT INTO jobs (company_id, job_role, package_lpa, min_cgpa, job_location, deadline) VALUES (?, ?, ?, ?, ?, ?)', [companyId, jobRole, packageLpa, minCgpa, jobLocation, deadline])
    res.status(201).json({ message: 'Job created', job_id: result.insertId, id: result.insertId })
  } catch (error) { if (error.code === 'ER_NO_REFERENCED_ROW_2') return validationError(res, 'Selected company does not exist'); next(error) }
})

app.get('/api/applications', authentication(db), async (req, res, next) => {
  try {
    const [rows] = await db.query(`SELECT a.application_id, a.student_id, a.job_id, a.application_date, a.status, s.name AS student_name, s.email, s.cgpa, j.job_role, j.package_lpa, j.job_location, c.company_name FROM applications a JOIN students s ON s.student_id = a.student_id JOIN jobs j ON j.job_id = a.job_id JOIN companies c ON c.company_id = j.company_id ORDER BY a.application_id DESC`)
    res.json(rows.map(serializeApplication))
  } catch (error) { next(error) }
})

app.post('/api/applications', authentication(db), canManage, async (req, res, next) => {
  try {
    const studentId = parseId(req.body.student_id ?? req.body.studentId), jobId = parseId(req.body.job_id ?? req.body.jobId)
    if (!studentId || !jobId) return validationError(res, 'Student and job are required')
    const [[job]] = await db.execute('SELECT min_cgpa FROM jobs WHERE job_id = ?', [jobId])
    const [[student]] = await db.execute('SELECT cgpa FROM students WHERE student_id = ?', [studentId])
    if (!job) return validationError(res, 'Job does not exist')
    if (!student) return validationError(res, 'Student does not exist')
    if (job.min_cgpa !== null && (student.cgpa === null || Number(student.cgpa) < Number(job.min_cgpa))) return validationError(res, 'Student does not meet the minimum CGPA')
    const rawApplicationDate = req.body.application_date ?? req.body.applicationDate
    if (rawApplicationDate && !dateOnly(rawApplicationDate)) return validationError(res, 'Application date must be a valid calendar date in YYYY-MM-DD format')
    const applicationDate = rawApplicationDate || new Date().toISOString().slice(0, 10)
    const [result] = await db.execute('INSERT INTO applications (student_id, job_id, application_date, status) VALUES (?, ?, ?, ?)', [studentId, jobId, applicationDate, 'Applied'])
    res.status(201).json({ message: 'Application created', application_id: result.insertId, id: result.insertId })
  } catch (error) { if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Student has already applied for this job' }); if (error.code === 'ER_NO_REFERENCED_ROW_2') return validationError(res, 'Student or job does not exist'); next(error) }
})

app.patch('/api/applications/:id/status', authentication(db), canManage, async (req, res, next) => {
  try {
    const id = parseId(req.params.id), status = normalizeStatus(req.body.status)
    if (!id || !status) return validationError(res, `Invalid application status. Use ${STATUS_VALUES.join(', ')}.`)
    const connection = await db.getConnection()
    try {
      await connection.beginTransaction()
      const [[current]] = await connection.execute('SELECT status FROM applications WHERE application_id = ? FOR UPDATE', [id])
      if (!current) { await connection.rollback(); return res.status(404).json({ error: 'Application not found' }) }
      await connection.execute('UPDATE applications SET status = ? WHERE application_id = ?', [status, id])
      if (current.status !== status) await connection.execute('INSERT INTO application_status_history (application_id, old_status, new_status, changed_by) VALUES (?, ?, ?, ?)', [id, current.status, status, req.user.id])
      await connection.commit()
      res.json({ message: 'Application status updated', status })
    } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
  } catch (error) { next(error) }
})

app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found' }))

if (process.env.SERVE_FRONTEND === 'true') {
  const distPath = path.join(__dirname, 'dist')
  app.use(express.static(distPath))
  app.use((req, res, next) => req.path.startsWith('/api') ? next() : res.sendFile(path.join(distPath, 'index.html')))
}

app.use((error, req, res, next) => {
  console.error(`${req.method} ${req.originalUrl}:`, error.message)
  if (res.headersSent) return next(error)
  res.status(500).json({ error: 'An unexpected server error occurred.' })
})

async function cleanupAuthArtifacts() {
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    await connection.execute("DELETE FROM sessions WHERE (expires_at < UTC_TIMESTAMP() OR revoked_at IS NOT NULL) AND created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)")
    await connection.execute("DELETE FROM password_reset_tokens WHERE (expires_at < UTC_TIMESTAMP() OR used_at IS NOT NULL) AND created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 DAY)")
    await connection.commit()
  } catch (error) {
    await connection.rollback()
    console.error('Auth cleanup failed:', error.message)
  } finally { connection.release() }
}

const PORT = Number(process.env.PORT) || 5000
if (require.main === module) {
  const cleanupTimer = setInterval(cleanupAuthArtifacts, 6 * 60 * 60 * 1000)
  cleanupTimer.unref()
  app.listen(PORT, () => console.log(`Placement API running at http://localhost:${PORT}`))
}

module.exports = app
