import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronDown,
  CircleAlert,
  ClipboardList,
  GraduationCap,
  Eye,
  EyeOff,
  LayoutDashboard,
  LoaderCircle,
  Menu,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Target,
  Users,
  UserCog,
  X,
} from 'lucide-react'
 import { Link, NavLink, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { api, unwrapCollection, unwrapObject } from './api'
import { useAuth } from './AuthContext'
import { useTheme } from './ThemeContext'

const navigation = [
  { label: 'Overview', to: '/', icon: LayoutDashboard, end: true },
  { label: 'Students', to: '/students', icon: GraduationCap },
  { label: 'Companies', to: '/companies', icon: Building2 },
  { label: 'Jobs & drives', to: '/jobs', icon: BriefcaseBusiness },
  { label: 'Applications', to: '/applications', icon: ClipboardList },
  { label: 'Reports', to: '/reports', icon: Target },
  { label: 'User access', to: '/users', icon: UserCog, adminOnly: true },
]

const pageMeta = {
  '/': { eyebrow: 'Placement cell', title: 'Good morning, coordinator', subtitle: 'Keep your campus hiring pipeline moving with confidence.' },
  '/students': { eyebrow: 'Directory', title: 'Students', subtitle: 'Manage candidate profiles and academic readiness.' },
  '/companies': { eyebrow: 'Partners', title: 'Companies', subtitle: 'Build a trusted network of hiring partners.' },
  '/jobs': { eyebrow: 'Opportunities', title: 'Jobs & drives', subtitle: 'Track every role that is open for your students.' },
  '/applications': { eyebrow: 'Pipeline', title: 'Applications', subtitle: 'Review progress and keep every candidate moving forward.' },
  '/reports': { eyebrow: 'Insights', title: 'Reports', subtitle: 'Turn placement activity into decisions for your team.' },
  '/users': { eyebrow: 'Administration', title: 'User access', subtitle: 'Provision accounts and keep workspace permissions intentional.' },
}

function getId(item) {
  return item?.id ?? item?._id ?? item?.student_id ?? item?.company_id ?? item?.job_id ?? item?.application_id
}

function getApplicationId(application) {
  return application?.id ?? application?._id ?? application?.application_id
}

function canManage(user) {
  return Boolean(user?.roles?.some((role) => role === 'admin' || role === 'coordinator'))
}

function valueOf(item, ...keys) {
  for (const key of keys) {
    if (item?.[key] !== undefined && item?.[key] !== null) return item[key]
  }
  return ''
}

function formatDate(value) {
  if (!value) return '—'
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value))
    ? new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)))
    : new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

function isPastDate(value) {
  if (!value) return false
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return value < new Date().toISOString().slice(0, 10)
  const date = new Date(value)
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now()
}

function initials(value = '') {
  return value.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '—'
}

function getStatus(item) {
  return String(valueOf(item, 'status', 'application_status') || 'Pending').toLowerCase()
}

function statusLabel(status) {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function StatusBadge({ status }) {
  const normalized = String(status || 'pending').toLowerCase()
  return <span className={`status-badge status-${normalized.replaceAll(' ', '-')}`}>{statusLabel(normalized)}</span>
}

function LoadingState({ label = 'Loading workspace data' }) {
  return <div className="state-box" role="status" aria-live="polite"><LoaderCircle className="spin" size={22} /><span>{label}...</span></div>
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="state-box state-error" role="alert">
      <CircleAlert size={22} />
      <div><strong>Could not load this view</strong><span>{message}</span></div>
      {onRetry && <button className="button button-light button-small" onClick={onRetry}><RefreshCw size={15} /> Retry</button>}
    </div>
  )
}

function EmptyState({ icon: Icon = ClipboardList, title, description, action }) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon size={23} /></span>
      <strong>{title}</strong>
      <span>{description}</span>
      {action}
    </div>
  )
}

function Modal({ title, description, onClose, children, wide = false }) {
  const closeRef = useRef(onClose)
  const modalRef = useRef(null)
  closeRef.current = onClose
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const firstControl = modalRef.current?.querySelector('input, select, textarea') || modalRef.current?.querySelector('button')
    firstControl?.focus()
    const onKeyDown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current() }
      if (event.key !== 'Tab' || !modalRef.current) return
      const focusable = [...modalRef.current.querySelectorAll('button, input, select, textarea, [href]')].filter((element) => !element.disabled)
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKeyDown) }
  }, [])
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={modalRef} className={`modal-card ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby={description ? 'modal-description' : undefined}>
        <div className="modal-header">
          <div><h2 id="modal-title">{title}</h2>{description && <p id="modal-description">{description}</p>}</div>
          <button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={19} /></button>
        </div>
        {children}
      </section>
    </div>
  )
}

function Field({ label, name, value, onChange, type = 'text', placeholder, required = false, min, step, options, help }) {
  return (
    <label className="field">
      <span>{label}{required && <b>*</b>}</span>
      {options ? (
        <select name={name} value={value} onChange={onChange} required={required}>
          <option value="">Select {label.toLowerCase()}</option>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      ) : (
        <input name={name} value={value} onChange={onChange} type={type} placeholder={placeholder} required={required} min={min} step={step} />
      )}
      {help && <small>{help}</small>}
    </label>
  )
}

function SearchField({ value, onChange, placeholder = 'Search...' }) {
  return <label className="search-field"><Search size={17} /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={placeholder} /></label>
}

function SectionHeading({ title, description, action }) {
  return <div className="section-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>
}

function AppShell() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const current = pageMeta[location.pathname] || pageMeta['/']

  useEffect(() => setMobileNavOpen(false), [location.pathname])

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup">
          <span className="brand-mark"><Sparkles size={19} /></span>
          <div><strong>Campus<span>Flow</span></strong><small>PLACEMENT HUB</small></div>
        </div>
        <div className="sidebar-label">Workspace</div>
        <nav className="sidebar-nav" id="primary-navigation">
          {navigation.filter((item) => !item.adminOnly || user?.roles?.includes('admin')).map(({ label, to, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}>
              <Icon size={18} strokeWidth={1.9} /><span>{label}</span>{label === 'Applications' && <span className="nav-dot" />}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-label">Account</div>
          <div className="profile-card"><span className="avatar avatar-sm">{initials(user?.name || 'User')}</span><div><strong>{user?.name || 'User'}</strong><small>{user?.email || user?.roles?.[0] || 'Signed in'}</small></div><ChevronDown size={15} /></div>
        </div>
      </aside>
      {mobileNavOpen && <button className="mobile-scrim" aria-label="Close menu" onClick={() => setMobileNavOpen(false)} />}
      <main className="main-content">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Open navigation" aria-expanded={mobileNavOpen} aria-controls="primary-navigation" onClick={() => setMobileNavOpen(true)}><Menu size={21} /></button>
          <div className="breadcrumb"><span>CampusFlow</span><b>/</b><strong>{current.title.replace('Good morning, coordinator', 'Overview')}</strong></div>
          <div className="topbar-actions"><span className="api-indicator"><i /> Live workspace</span><button className="theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}><span>{theme === 'dark' ? '☀' : '☾'}</span></button><div className="profile-menu"><span className="avatar">{initials(user?.name || 'User')}</span><div className="profile-menu-copy"><strong>{user?.name || 'User'}</strong><small>{user?.roles?.[0] || 'Viewer'}</small></div><button className="profile-logout" onClick={async () => { await logout(); navigate('/login', { replace: true }) }}>Sign out</button></div></div>
        </header>
        <div className="page-wrap">
          <div className="page-intro"><div><span className="eyebrow">{current.eyebrow}</span><h1>{current.title}</h1><p>{current.subtitle}</p></div>{location.pathname === '/' && <div className="date-chip">Academic year <strong>2024–25</strong></div>}</div>
          <Outlet />
        </div>
      </main>
    </div>
  )
}

function Dashboard() {
  const [stats, setStats] = useState(null)
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const requestVersion = useRef(0)

  const loadDashboard = async () => {
    const version = ++requestVersion.current
    setLoading(true)
    setError('')
    try {
      const payload = unwrapObject(await api.getDashboardStats(), ['stats', 'dashboard'])
      if (version !== requestVersion.current) return
      setStats(payload)
      setActivity(unwrapCollection(payload, ['recentActivity', 'recent_activity', 'activities']))
    } catch (requestError) {
      if (version !== requestVersion.current) return
      setError(requestError.message)
      setStats(null)
      setActivity([])
    } finally {
      if (version !== requestVersion.current) return
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDashboard()
    const refresh = () => loadDashboard()
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh() }
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') refresh() }, 45000)
    window.addEventListener('placement:data-changed', refresh)
    document.addEventListener('visibilitychange', onVisibility)
    return () => { window.clearInterval(interval); window.removeEventListener('placement:data-changed', refresh); document.removeEventListener('visibilitychange', onVisibility) }
  }, [])

  const statCards = [
    { label: 'Total students', value: valueOf(stats, 'totalStudents', 'students_count', 'studentCount'), icon: GraduationCap, color: 'blue', foot: 'Registered profiles' },
    { label: 'Partner companies', value: valueOf(stats, 'totalCompanies', 'companies_count', 'companyCount'), icon: Building2, color: 'purple', foot: 'Hiring partners' },
    { label: 'Active job openings', value: valueOf(stats, 'totalJobs', 'jobs_count', 'jobCount'), icon: BriefcaseBusiness, color: 'orange', foot: 'Open opportunities' },
    { label: 'Total applications', value: valueOf(stats, 'totalApplications', 'applications_count', 'applicationCount'), icon: ClipboardList, color: 'cyan', foot: 'Across all drives' },
    { label: 'Placement rate', value: valueOf(stats, 'placementRate', 'placement_rate'), icon: Target, color: 'green', foot: 'Current academic year', suffix: '%' },
  ]
  const statusCounts = stats?.statusCounts || Object.fromEntries((stats?.statuses || []).map((item) => [String(item.status).toLowerCase(), Number(item.total)]))
  const statusEntries = [['applied', 'Applied'], ['shortlisted', 'Shortlisted'], ['selected', 'Selected'], ['rejected', 'Rejected']].map(([key, label]) => ({ key, label, value: Number(statusCounts[key] || statusCounts[label] || 0) }))
  const maxStatusCount = Math.max(...statusEntries.map((entry) => entry.value), 1)

  return (
    <div className="content-stack">
      {error && <ErrorState message={error} onRetry={loadDashboard} />}
      <div className="stat-grid">
        {statCards.map(({ label, value, icon: Icon, color, foot, suffix }) => (
          <div className="stat-card" key={label}><div className={`stat-icon stat-${color}`}><Icon size={19} /></div><span className="stat-label">{label}</span><strong className="stat-value">{loading ? <span className="skeleton-line" /> : value === '' ? '—' : `${value}${suffix || ''}`}</strong><span className="stat-foot">{foot}</span></div>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel activity-panel">
          <SectionHeading title="Recent activity" description="The latest movement across your placement pipeline." action={<Link className="text-link" to="/applications">View all <ArrowUpRight size={15} /></Link>} />
          {loading ? <LoadingState label="Loading recent activity" /> : activity.length === 0 ? <EmptyState icon={ClipboardList} title="No recent activity" description="Activity from your backend will appear here." action={<Link className="button button-light button-small" to="/applications">Open applications</Link>} /> : <div className="activity-list">{activity.slice(0, 5).map((item, index) => <ActivityItem key={getId(item) || index} item={item} />)}</div>}
        </section>
        <section className="panel pulse-panel">
          <SectionHeading title="Placement pulse" description="A quick view of the numbers driving this season." />
          <div className="pulse-visual"><div className="pulse-ring"><span>{valueOf(stats, 'placementRate', 'placement_rate') === '' ? '—' : `${valueOf(stats, 'placementRate', 'placement_rate')}%`}</span><small>placed</small></div><div className="pulse-legend"><div><i className="legend-green" /><span>Placed</span><strong>{valueOf(stats, 'placedStudents', 'placed_students') || '—'}</strong></div><div><i className="legend-cyan" /><span>In process</span><strong>{valueOf(stats, 'inProcessApplications', 'in_process') || '—'}</strong></div><div><i className="legend-grey" /><span>Looking</span><strong>{valueOf(stats, 'unplacedStudents', 'unplaced_students') || '—'}</strong></div></div></div>
           <div className="insight-note"><Sparkles size={16} /><span>Live database metrics refresh every 45 seconds while this tab is visible.</span></div>
           <div className="dashboard-chart"><div className="dashboard-chart-heading"><strong>Application outcomes</strong><Link to="/reports">Reports <ArrowUpRight size={13} /></Link></div>{statusEntries.map((entry) => <div className="dashboard-chart-row" key={entry.key}><span>{entry.label}</span><div><i style={{ width: `${(entry.value / maxStatusCount) * 100}%` }} /></div><strong>{entry.value}</strong></div>)}</div>
        </section>
      </div>
    </div>
  )
}

function ActivityItem({ item }) {
  const student = valueOf(item, 'studentName', 'student_name', 'student') || 'Student'
  const company = valueOf(item, 'companyName', 'company_name', 'company') || 'a company'
  const status = getStatus(item)
  const sentence = valueOf(item, 'description', 'message') || `${student} applied to ${company}`
  return <div className="activity-item"><span className={`activity-icon activity-${status}`}><Check size={15} /></span><div><strong>{sentence}</strong><span>{formatDate(valueOf(item, 'date', 'createdAt', 'applicationDate', 'application_date', 'activity_date'))}</span></div><StatusBadge status={status} /></div>
}

const emptyStudent = { name: '', email: '', branch: '', cgpa: '' }

function StudentsPage() {
  const { user } = useAuth()
  const editor = canManage(user)
  const [students, setStudents] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalError, setModalError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingStudent, setEditingStudent] = useState(null)
  const [form, setForm] = useState(emptyStudent)
  const [saving, setSaving] = useState(false)

  const loadStudents = async () => {
    setLoading(true)
    setError('')
    try {
      setStudents(unwrapCollection(await api.getStudents(), ['students']))
    } catch (requestError) {
      setError(requestError.message)
      setStudents([])
    } finally { setLoading(false) }
  }

  useEffect(() => { loadStudents() }, [])

  const filteredStudents = useMemo(() => students.filter((student) => {
    const searchable = [valueOf(student, 'name', 'full_name'), valueOf(student, 'email'), valueOf(student, 'branch', 'department')].join(' ').toLowerCase()
    return searchable.includes(query.toLowerCase())
  }), [students, query])

  const openCreate = () => { setEditingStudent(null); setForm(emptyStudent); setModalError(''); setShowModal(true) }
  const openEdit = (student) => { setEditingStudent(student); setForm({ name: valueOf(student, 'name', 'full_name'), email: valueOf(student, 'email'), branch: valueOf(student, 'branch', 'department'), cgpa: valueOf(student, 'cgpa', 'CGPA') }); setModalError(''); setShowModal(true) }

  const submitStudent = async (event) => {
    event.preventDefault()
    setSaving(true)
    setModalError('')
    const payload = { ...form, cgpa: Number(form.cgpa) }
    try {
      if (editingStudent) await api.updateStudent(getId(editingStudent), payload)
      else await api.createStudent(payload)
      setShowModal(false)
      await loadStudents()
    } catch (requestError) { setModalError(requestError.message) } finally { setSaving(false) }
  }

  return (
    <div className="content-stack">
      <div className="toolbar"><SearchField value={query} onChange={setQuery} placeholder="Search by name, email or branch" /><div className="toolbar-actions">{editor && <button className="button button-primary" onClick={openCreate}><Plus size={17} /> Add student</button>}</div></div>
      <section className="panel table-panel">
        <SectionHeading title="Student directory" description={`${students.length} student${students.length === 1 ? '' : 's'} connected to the placement cell.`} />
        {loading ? <LoadingState label="Loading students" /> : error ? <ErrorState message={error} onRetry={loadStudents} /> : filteredStudents.length === 0 ? <EmptyState icon={Users} title={query ? 'No matching students' : 'No students yet'} description={query ? 'Try a different search term.' : 'Add your first student profile to get started.'} action={!query && editor && <button className="button button-primary button-small" onClick={openCreate}><Plus size={15} /> Add student</button>} /> : <div className="table-scroll"><table><thead><tr><th>Student</th><th>Branch</th><th>CGPA</th><th>Profile status</th><th className="align-right">Action</th></tr></thead><tbody>{filteredStudents.map((student, index) => { const name = valueOf(student, 'name', 'full_name') || 'Unnamed student'; const email = valueOf(student, 'email'); const cgpa = valueOf(student, 'cgpa', 'CGPA'); return <tr key={getId(student) || index}><td><div className="person-cell"><span className="avatar avatar-table">{initials(name)}</span><div><strong>{name}</strong><span>{email || 'No email provided'}</span></div></div></td><td><span className="muted-strong">{valueOf(student, 'branch', 'department') || '—'}</span></td><td><span className="cgpa-value">{cgpa === '' ? '—' : Number(cgpa).toFixed(2)}</span></td><td><span className="soft-tag"><i /> Profile ready</span></td><td className="align-right">{editor && <button className="table-action" onClick={() => openEdit(student)}><Pencil size={15} /> Edit</button>}</td></tr> })}</tbody></table></div>}
      </section>
      {showModal && <Modal title={editingStudent ? 'Edit student profile' : 'Add a student'} description="Keep candidate details accurate for every hiring drive." onClose={() => !saving && setShowModal(false)}><form className="form-grid" onSubmit={submitStudent}>{modalError && <div className="form-error full-width"><CircleAlert size={16} />{modalError}</div>}<Field label="Full name" name="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Aditi Sharma" required /><Field label="Email address" name="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} type="email" placeholder="aditi@college.edu" required /><Field label="Branch" name="branch" value={form.branch} onChange={(event) => setForm({ ...form, branch: event.target.value })} placeholder="e.g. Computer Science" required /><Field label="CGPA" name="cgpa" value={form.cgpa} onChange={(event) => setForm({ ...form, cgpa: event.target.value })} type="number" min="0" max="10" step="0.01" placeholder="8.50" required help="Use a scale of 0 to 10." /><div className="modal-actions full-width"><button type="button" className="button button-light" onClick={() => setShowModal(false)} disabled={saving}>Cancel</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? <><LoaderCircle className="spin" size={16} /> Saving...</> : <><Check size={16} /> {editingStudent ? 'Save changes' : 'Add student'}</>}</button></div></form></Modal>}
    </div>
  )
}

const emptyCompany = { name: '', industry: '', location: '', website: '' }

function CompaniesPage() {
  const { user } = useAuth()
  const editor = canManage(user)
  const [companies, setCompanies] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalError, setModalError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(emptyCompany)
  const [saving, setSaving] = useState(false)

  const loadCompanies = async () => {
    setLoading(true); setError('')
    try { setCompanies(unwrapCollection(await api.getCompanies(), ['companies'])) } catch (requestError) { setError(requestError.message); setCompanies([]) } finally { setLoading(false) }
  }
  useEffect(() => { loadCompanies() }, [])

  const filteredCompanies = useMemo(() => companies.filter((company) => [valueOf(company, 'name', 'company_name'), valueOf(company, 'industry'), valueOf(company, 'location')].join(' ').toLowerCase().includes(query.toLowerCase())), [companies, query])
  const submitCompany = async (event) => {
    event.preventDefault(); setSaving(true); setModalError('')
    try { await api.createCompany(form); setShowModal(false); setForm(emptyCompany); await loadCompanies() } catch (requestError) { setModalError(requestError.message) } finally { setSaving(false) }
  }

  return (
    <div className="content-stack">
      <div className="toolbar"><SearchField value={query} onChange={setQuery} placeholder="Search companies or industries" /><div className="toolbar-actions">{editor && <button className="button button-primary" onClick={() => { setModalError(''); setShowModal(true) }}><Plus size={17} /> Add company</button>}</div></div>
      <section className="panel table-panel"><SectionHeading title="Hiring partners" description={`${companies.length} compan${companies.length === 1 ? 'y' : 'ies'} in your partner network.`} />{loading ? <LoadingState label="Loading companies" /> : error ? <ErrorState message={error} onRetry={loadCompanies} /> : filteredCompanies.length === 0 ? <EmptyState icon={Building2} title={query ? 'No matching companies' : 'No companies yet'} description={query ? 'Try a different search term.' : 'Add your first hiring partner to start building your network.'} action={!query && editor && <button className="button button-primary button-small" onClick={() => setShowModal(true)}><Plus size={15} /> Add company</button>} /> : <div className="company-grid">{filteredCompanies.map((company, index) => { const name = valueOf(company, 'name', 'company_name') || 'Unnamed company'; const website = valueOf(company, 'website', 'url'); return <article className="company-card" key={getId(company) || index}><div className="company-card-top"><span className="company-logo">{initials(name)}</span></div><h3>{name}</h3><span className="industry-label">{valueOf(company, 'industry') || 'Industry not specified'}</span><div className="company-meta"><span><Building2 size={14} />{valueOf(company, 'location') || 'Location not specified'}</span>{website ? <a href={website.startsWith('http') ? website : `https://${website}`} target="_blank" rel="noreferrer">Visit website <ArrowUpRight size={13} /></a> : <span className="muted">No website</span>}</div></article> })}</div>}</section>
      {showModal && <Modal title="Add a company" description="Add a hiring partner to your placement network." onClose={() => !saving && setShowModal(false)}><form className="form-grid" onSubmit={submitCompany}>{modalError && <div className="form-error full-width"><CircleAlert size={16} />{modalError}</div>}<Field label="Company name" name="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Vertex Labs" required /><Field label="Industry" name="industry" value={form.industry} onChange={(event) => setForm({ ...form, industry: event.target.value })} placeholder="e.g. Software & technology" required /><Field label="Location" name="location" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="e.g. Bengaluru, India" required /><Field label="Website" name="website" value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} type="url" placeholder="https://company.com" /><div className="modal-actions full-width"><button type="button" className="button button-light" onClick={() => setShowModal(false)} disabled={saving}>Cancel</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? <><LoaderCircle className="spin" size={16} /> Saving...</> : <><Check size={16} /> Add company</>}</button></div></form></Modal>}
    </div>
  )
}

const emptyJob = { companyId: '', role: '', packageLpa: '', minCgpa: '', location: '', deadline: '' }

function JobsPage() {
  const { user } = useAuth()
  const editor = canManage(user)
  const [jobs, setJobs] = useState([])
  const [companies, setCompanies] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalError, setModalError] = useState('')
  const [showModal, setShowModalState] = useState(false)
  const [form, setForm] = useState(emptyJob)
  const [saving, setSaving] = useState(false)
  const setShowModal = (value) => { if (value && !editor) return; setShowModalState(value) }

  const loadJobs = async () => {
    setLoading(true); setError('')
    try {
      const [jobsPayload, companyPayload] = await Promise.all([api.getJobs(), api.getCompanies()])
      setJobs(unwrapCollection(jobsPayload, ['jobs']))
      setCompanies(unwrapCollection(companyPayload, ['companies']))
    } catch (requestError) { setError(requestError.message); setJobs([]) } finally { setLoading(false) }
  }
  useEffect(() => { loadJobs() }, [])
  const filteredJobs = useMemo(() => jobs.filter((job) => [valueOf(job, 'role', 'title', 'job_role'), valueOf(job, 'companyName', 'company_name', 'company'), valueOf(job, 'location')].join(' ').toLowerCase().includes(query.toLowerCase())), [jobs, query])
  const submitJob = async (event) => {
    event.preventDefault(); setSaving(true); setModalError('')
    const payload = { ...form, packageLpa: Number(form.packageLpa), minCgpa: Number(form.minCgpa) }
    try { await api.createJob(payload); setShowModal(false); setForm(emptyJob); await loadJobs() } catch (requestError) { setModalError(requestError.message) } finally { setSaving(false) }
  }

  return (
    <div className="content-stack">
      <div className="toolbar"><SearchField value={query} onChange={setQuery} placeholder="Search by role, company or location" /><div className="toolbar-actions">{editor && <button className="button button-primary" onClick={() => { setModalError(''); setShowModal(true) }}><Plus size={17} /> Add job opening</button>}</div></div>
       <section className="panel table-panel"><SectionHeading title="Open opportunities" description={`${jobs.length} role${jobs.length === 1 ? '' : 's'} currently tracked by your placement cell.`} />{loading ? <LoadingState label="Loading job openings" /> : error ? <ErrorState message={error} onRetry={loadJobs} /> : filteredJobs.length === 0 ? <EmptyState icon={BriefcaseBusiness} title={query ? 'No matching opportunities' : 'No job openings yet'} description={query ? 'Try a different search term.' : 'Add a role to make an opportunity visible to students.'} action={!query && <button className="button button-primary button-small" onClick={() => setShowModal(true)}><Plus size={15} /> Add job opening</button>} /> : <div className="table-scroll"><table><thead><tr><th>Role</th><th>Company</th><th>Compensation</th><th>Eligibility</th><th>Location</th><th>Deadline</th></tr></thead><tbody>{filteredJobs.map((job, index) => { const role = valueOf(job, 'role', 'title', 'job_role') || 'Untitled role'; const companyValue = valueOf(job, 'companyName', 'company_name', 'company'); const company = typeof companyValue === 'object' ? valueOf(companyValue, 'name', 'company_name') : companyValue || companyNameFor(job, companies); const deadline = valueOf(job, 'deadline', 'application_deadline'); return <tr key={getId(job) || index}><td><div className="role-cell"><span className="role-icon"><BriefcaseBusiness size={16} /></span><div><strong>{role}</strong><span>{valueOf(job, 'employmentType', 'employment_type') || 'Full-time'}</span></div></div></td><td><span className="muted-strong">{company || '—'}</span></td><td><strong className="package-value">{formatPackage(valueOf(job, 'packageLpa', 'package_lpa', 'package'))}</strong></td><td><span className="soft-tag soft-tag-blue">CGPA {valueOf(job, 'minCgpa', 'min_cgpa', 'minimumCgpa') || '—'}+</span></td><td>{valueOf(job, 'location') || '—'}</td><td><span className={deadline && new Date(deadline) < new Date() ? 'overdue' : ''}>{formatDate(deadline)}</span></td></tr> })}</tbody></table></div>}</section>
      {showModal && <Modal title="Add a job opening" description="Share the details students need to make an informed application." onClose={() => !saving && setShowModal(false)}><form className="form-grid" onSubmit={submitJob}>{modalError && <div className="form-error full-width"><CircleAlert size={16} />{modalError}</div>}<Field label="Company" name="companyId" value={form.companyId} onChange={(event) => setForm({ ...form, companyId: event.target.value })} options={companies.map((company) => ({ value: getId(company), label: valueOf(company, 'name', 'company_name') }))} required /><Field label="Role title" name="role" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} placeholder="e.g. Product Designer" required /><Field label="Package (LPA)" name="packageLpa" value={form.packageLpa} onChange={(event) => setForm({ ...form, packageLpa: event.target.value })} type="number" min="0" step="0.1" placeholder="8.5" required /><Field label="Minimum CGPA" name="minCgpa" value={form.minCgpa} onChange={(event) => setForm({ ...form, minCgpa: event.target.value })} type="number" min="0" max="10" step="0.01" placeholder="7.5" required /><Field label="Location" name="location" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="e.g. Bengaluru / Remote" required /><Field label="Application deadline" name="deadline" value={form.deadline} onChange={(event) => setForm({ ...form, deadline: event.target.value })} type="date" required /><div className="modal-actions full-width"><button type="button" className="button button-light" onClick={() => setShowModal(false)} disabled={saving}>Cancel</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? <><LoaderCircle className="spin" size={16} /> Saving...</> : <><Check size={16} /> Add opening</>}</button></div></form></Modal>}
    </div>
  )
}

function companyNameFor(job, companies) {
  const companyId = valueOf(job, 'companyId', 'company_id')
  const match = companies.find((company) => String(getId(company)) === String(companyId))
  return match ? valueOf(match, 'name', 'company_name') : ''
}

function formatPackage(value) {
  if (value === '' || value === null || value === undefined) return '—'
  const numeric = Number.parseFloat(value)
  return Number.isNaN(numeric) ? value : `₹${numeric.toFixed(1)} LPA`
}

const applicationStatuses = ['applied', 'shortlisted', 'selected', 'rejected']
function localDateInputValue(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
function createEmptyApplication() { return { studentId: '', jobId: '', applicationDate: localDateInputValue() } }

function applicationStudentName(application) {
  const student = valueOf(application, 'studentName', 'student_name')
  if (typeof student === 'object') return valueOf(student, 'name', 'full_name') || 'Unknown student'
  const relation = valueOf(application, 'student')
  return student || (typeof relation === 'object' ? valueOf(relation, 'name', 'full_name') : relation) || 'Unknown student'
}

function applicationCompanyName(application) {
  const company = valueOf(application, 'companyName', 'company_name')
  if (typeof company === 'object') return valueOf(company, 'name', 'company_name') || 'Unknown company'
  const relation = valueOf(application, 'company')
  return company || (typeof relation === 'object' ? valueOf(relation, 'name', 'company_name') : relation) || 'Unknown company'
}

function applicationRole(application) {
  const job = valueOf(application, 'jobRole', 'job_role', 'role')
  if (typeof job === 'object') return valueOf(job, 'role', 'title', 'job_role') || 'Unknown role'
  const relation = valueOf(application, 'job')
  return job || (typeof relation === 'object' ? valueOf(relation, 'role', 'title', 'job_role') : relation) || 'Unknown role'
}

function ApplicationsPage() {
  const { user } = useAuth()
  const editor = canManage(user)
  const [applications, setApplications] = useState([])
  const [students, setStudents] = useState([])
  const [jobs, setJobs] = useState([])
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updateError, setUpdateError] = useState('')
  const [updatingId, setUpdatingId] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [modalError, setModalError] = useState('')
  const [form, setForm] = useState(createEmptyApplication)
  const [saving, setSaving] = useState(false)

  const loadApplications = async () => {
    setLoading(true); setError('')
    try {
      const [applicationPayload, studentPayload, jobPayload] = await Promise.all([api.getApplications(), api.getStudents(), api.getJobs()])
      setApplications(unwrapCollection(applicationPayload, ['applications']))
      setStudents(unwrapCollection(studentPayload, ['students']))
      setJobs(unwrapCollection(jobPayload, ['jobs']))
    } catch (requestError) { setError(requestError.message); setApplications([]) } finally { setLoading(false) }
  }
  useEffect(() => { loadApplications() }, [])

  const filteredApplications = useMemo(() => applications.filter((application) => {
    const matchesStatus = statusFilter === 'all' || getStatus(application) === statusFilter
    const searchable = [applicationStudentName(application), applicationCompanyName(application), applicationRole(application)].join(' ').toLowerCase()
    return matchesStatus && searchable.includes(query.toLowerCase())
  }), [applications, query, statusFilter])

  const changeStatus = async (application, status) => {
    const id = getApplicationId(application)
    if (!id) { setUpdateError('This application has no id, so its status cannot be updated.'); return }
    setUpdatingId(String(id)); setUpdateError('')
    try { await api.updateApplicationStatus(id, status); await loadApplications() } catch (requestError) { setUpdateError(requestError.message) } finally { setUpdatingId('') }
  }

  const submitApplication = async (event) => {
    event.preventDefault(); setSaving(true); setModalError('')
    try { await api.createApplication(form); setShowModal(false); setForm(createEmptyApplication()); await loadApplications() } catch (requestError) { setModalError(requestError.message) } finally { setSaving(false) }
  }

  return (
    <div className="content-stack">
      {updateError && <div className="inline-error" role="alert"><CircleAlert size={16} />{updateError}<button aria-label="Dismiss error" onClick={() => setUpdateError('')}><X size={15} /></button></div>}
      <div className="toolbar"><SearchField value={query} onChange={setQuery} placeholder="Search students, companies or roles" /><div className="toolbar-actions"><label className="select-filter"><SlidersHorizontal size={16} /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{applicationStatuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>{editor && <button className="button button-primary" onClick={() => { setModalError(''); setShowModal(true) }}><Plus size={17} /> New application</button>}</div></div>
      <section className="panel table-panel"><SectionHeading title="Application pipeline" description={`${applications.length} application${applications.length === 1 ? '' : 's'} across your active drives.`} />{loading ? <LoadingState label="Loading applications" /> : error ? <ErrorState message={error} onRetry={loadApplications} /> : filteredApplications.length === 0 ? <EmptyState icon={ClipboardList} title={query || statusFilter !== 'all' ? 'No matching applications' : 'No applications yet'} description={query || statusFilter !== 'all' ? 'Try changing your search or status filter.' : 'Applications will appear here once students apply to roles.'} action={!query && statusFilter === 'all' && editor && <button className="button button-primary button-small" onClick={() => setShowModal(true)}><Plus size={15} /> New application</button>} /> : <div className="table-scroll"><table><thead><tr><th>Student</th><th>Company</th><th>Job role</th><th>Applied on</th><th>Status</th></tr></thead><tbody>{filteredApplications.map((application, index) => { const id = getApplicationId(application) || index; const currentStatus = getStatus(application); return <tr key={id}><td><div className="person-cell"><span className="avatar avatar-table avatar-lavender">{initials(applicationStudentName(application))}</span><div><strong>{applicationStudentName(application)}</strong><span>{valueOf(application, 'studentEmail', 'student_email', 'email') || 'Student applicant'}</span></div></div></td><td><span className="muted-strong">{applicationCompanyName(application)}</span></td><td>{applicationRole(application)}</td><td>{formatDate(valueOf(application, 'applicationDate', 'application_date', 'createdAt'))}</td><td><div className="status-edit"><StatusBadge status={currentStatus} /><label className="status-select"><select value={currentStatus} onChange={(event) => changeStatus(application, event.target.value)} disabled={!editor || String(id) === updatingId} aria-label={`Update status for ${applicationStudentName(application)}`}>{applicationStatuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select><ChevronDown size={13} />{String(id) === updatingId && <LoaderCircle className="spin status-spinner" size={13} />}</label></div></td></tr> })}</tbody></table></div>}</section>
      {showModal && <Modal title="Create an application" description="Link a student to an open opportunity. New applications start as Applied." onClose={() => !saving && setShowModal(false)}><form className="form-grid" onSubmit={submitApplication}>{modalError && <div className="form-error full-width"><CircleAlert size={16} />{modalError}</div>}<Field label="Student" name="studentId" value={form.studentId} onChange={(event) => setForm({ ...form, studentId: event.target.value })} options={students.map((student) => ({ value: getId(student), label: valueOf(student, 'name', 'full_name') }))} required /><Field label="Job opening" name="jobId" value={form.jobId} onChange={(event) => setForm({ ...form, jobId: event.target.value })} options={jobs.map((job) => ({ value: getId(job), label: `${valueOf(job, 'role', 'title', 'job_role') || 'Untitled role'} · ${valueOf(job, 'companyName', 'company_name') || 'Company'}` }))} required /><Field label="Application date" name="applicationDate" value={form.applicationDate} onChange={(event) => setForm({ ...form, applicationDate: event.target.value })} type="date" required /><div className="modal-actions full-width"><button type="button" className="button button-light" onClick={() => setShowModal(false)} disabled={saving}>Cancel</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? <><LoaderCircle className="spin" size={16} /> Saving...</> : <><Check size={16} /> Create application</>}</button></div></form></Modal>}
    </div>
  )
}

function ReportsPage() {
  const [applications, setApplications] = useState([])
  const [students, setStudents] = useState([])
  const [jobs, setJobs] = useState([])
  const [dashboardStats, setDashboardStats] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const requestVersion = useRef(0)

  const loadReports = async () => {
    const version = ++requestVersion.current
    setLoading(true); setError('')
    const [applicationResult, studentResult, jobResult, statsResult] = await Promise.allSettled([api.getApplications(), api.getStudents(), api.getJobs(), api.getDashboardStats()])
    if (version !== requestVersion.current) return
    const failures = [applicationResult, studentResult, jobResult, statsResult].filter((result) => result.status === 'rejected')
    if (failures.length) setError(failures.length === 4 ? failures[0].reason.message : `Some report sources are unavailable. Figures may be incomplete. ${failures[0].reason.message}`)
    if (applicationResult.status === 'fulfilled') setApplications(unwrapCollection(applicationResult.value, ['applications']))
    if (studentResult.status === 'fulfilled') setStudents(unwrapCollection(studentResult.value, ['students']))
    if (jobResult.status === 'fulfilled') setJobs(unwrapCollection(jobResult.value, ['jobs']))
    if (statsResult.status === 'fulfilled') setDashboardStats(unwrapObject(statsResult.value, ['stats', 'dashboard']))
    setLoading(false)
  }
  useEffect(() => {
    loadReports()
    const refresh = () => loadReports()
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh() }
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') refresh() }, 45000)
    window.addEventListener('placement:data-changed', refresh)
    document.addEventListener('visibilitychange', onVisibility)
    return () => { window.clearInterval(interval); window.removeEventListener('placement:data-changed', refresh); document.removeEventListener('visibilitychange', onVisibility) }
  }, [])

  const statusCounts = useMemo(() => applicationStatuses.reduce((counts, status) => { counts[status] = applications.filter((application) => getStatus(application) === status).length; return counts }, {}), [applications])
  const placedStudentKeys = new Set(applications.filter((application) => ['selected', 'placed', 'accepted'].includes(getStatus(application))).map((application) => valueOf(application, 'student_id', 'studentId') || applicationStudentName(application)))
  const backendPlacedCount = valueOf(dashboardStats, 'placedStudents', 'placed_students')
  const placedCount = backendPlacedCount === '' ? placedStudentKeys.size : Number(backendPlacedCount)
  const totalStudents = Number(valueOf(dashboardStats, 'totalStudents', 'students_count', 'studentCount')) || students.length
  const placementRateValue = valueOf(dashboardStats, 'placementRate', 'placement_rate')
  const placementRate = placementRateValue !== '' ? Number(placementRateValue) : totalStudents ? Math.round((placedCount / totalStudents) * 100) : null
  const averagePackage = jobs.length ? jobs.reduce((sum, job) => sum + (Number.parseFloat(valueOf(job, 'packageLpa', 'package_lpa', 'package')) || 0), 0) / jobs.filter((job) => Number.parseFloat(valueOf(job, 'packageLpa', 'package_lpa', 'package'))).length : 0
  const maxApplications = Math.max(...applicationStatuses.map((status) => statusCounts[status]), 1)
  const reportCards = [{ label: 'Placement rate', value: placementRate === null ? '—' : `${placementRate}%`, detail: 'Students placed' }, { label: 'Total applications', value: applications.length, detail: 'Across all drives' }, { label: 'Selected students', value: placedCount, detail: 'Distinct students selected' }, { label: 'Average package', value: averagePackage ? `₹${averagePackage.toFixed(1)} LPA` : '—', detail: 'From available job data' }]

 return <div className="content-stack">{error && <ErrorState message={error} onRetry={loadReports} />}{loading ? <LoadingState label="Preparing reports" /> : <><div className="report-stat-grid">{reportCards.map((card) => <div className="report-stat" key={card.label}><span>{card.label}</span><strong>{card.value}</strong><small>{card.detail}</small></div>)}</div><div className="reports-grid"><section className="panel chart-panel"><SectionHeading title="Application outcomes" description="How the current application pipeline is progressing." /><div className="bar-chart">{applicationStatuses.map((status) => <div className="bar-row" key={status}><span>{statusLabel(status)}</span><div className="bar-track"><i style={{ width: `${(statusCounts[status] / maxApplications) * 100}%` }} /></div><strong>{statusCounts[status]}</strong></div>)}</div></section><section className="panel summary-panel"><SectionHeading title="Season summary" description="Live figures from your connected data." /><div className="summary-list"><div><span>Student profiles</span><strong>{totalStudents}</strong></div><div><span>Open opportunities</span><strong>{jobs.length}</strong></div><div><span>Hiring partners</span><strong>{valueOf(dashboardStats, 'totalCompanies', 'companies_count') || 0}</strong></div><div><span>Rejected applications</span><strong>{statusCounts.rejected}</strong></div></div><div className="summary-callout"><Target size={17} /><div><strong>Keep the pipeline moving</strong><span>Update application status after every interview round to keep reports accurate.</span></div></div></section></div></>}</div>
}

function NotFound() {
  return <div className="content-stack"><section className="panel"><EmptyState icon={CircleAlert} title="Page not found" description="The page you are looking for does not exist." action={<Link className="button button-primary button-small" to="/">Back to overview</Link>} /></section></div>
}

function UsersPage() {
  const { user } = useAuth()
  const [users, setUsers] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'viewer' })

  const loadUsers = async () => {
    if (!user?.roles?.includes('admin')) return
    setLoading(true); setError('')
    try { setUsers(unwrapCollection(await api.getUsers(), ['users'])) } catch (requestError) { setError(requestError.message); setUsers([]) } finally { setLoading(false) }
  }
  useEffect(() => { loadUsers() }, [])
  const filtered = useMemo(() => users.filter((account) => [account.name, account.email, ...(account.roles || [])].join(' ').toLowerCase().includes(query.toLowerCase())), [users, query])
  const createUser = async (event) => {
    event.preventDefault(); setSaving(true); setFormError('')
    try { await api.createUser(form); setShowModal(false); setForm({ name: '', email: '', password: '', role: 'viewer' }); await loadUsers() } catch (requestError) { setFormError(requestError.message) } finally { setSaving(false) }
  }
  const updateRole = async (account, role) => { try { await api.updateUserRole(getId(account), role); await loadUsers() } catch (requestError) { setError(requestError.message) } }
  const updateStatus = async (account, status) => { try { await api.updateUserStatus(getId(account), status); await loadUsers() } catch (requestError) { setError(requestError.message) } }
  if (!user?.roles?.includes('admin')) return <div className="content-stack"><section className="panel"><EmptyState icon={CircleAlert} title="Administrator access required" description="Only administrators can manage workspace accounts and roles." action={<Link className="button button-primary button-small" to="/">Back to overview</Link>} /></section></div>

  return <div className="content-stack"><div className="toolbar"><SearchField value={query} onChange={setQuery} placeholder="Search accounts by name or email" /><button className="button button-primary" onClick={() => { setFormError(''); setShowModal(true) }}><Plus size={17} /> Provision account</button></div><section className="panel table-panel"><SectionHeading title="Workspace accounts" description="Admin-only access control. Password hashes never leave the server." />{loading ? <LoadingState label="Loading accounts" /> : error ? <ErrorState message={error} onRetry={loadUsers} /> : filtered.length === 0 ? <EmptyState icon={UserCog} title="No accounts found" description="Provision a coordinator or viewer account to share the workspace safely." action={<button className="button button-primary button-small" onClick={() => setShowModal(true)}><Plus size={15} /> Provision account</button>} /> : <div className="table-scroll"><table><thead><tr><th>Account</th><th>Role</th><th>Status</th><th>Last sign in</th></tr></thead><tbody>{filtered.map((account, index) => { const id = getId(account) || index; const role = account.roles?.[0] || 'viewer'; const status = account.status || 'active'; return <tr key={id}><td><div className="person-cell"><span className="avatar avatar-table avatar-lavender">{initials(account.name)}</span><div><strong>{account.name}</strong><span>{account.email}</span></div></div></td><td><select className="table-select" value={role} onChange={(event) => updateRole(account, event.target.value)}><option value="admin">Admin</option><option value="coordinator">Coordinator</option><option value="viewer">Viewer</option></select></td><td><button className={`account-status account-${status}`} onClick={() => updateStatus(account, status === 'active' ? 'suspended' : 'active')}>{statusLabel(status)} · click to {status === 'active' ? 'suspend' : 'activate'}</button></td><td>{formatDate(account.lastLoginAt)}</td></tr> })}</tbody></table></div>}</section>{showModal && <Modal title="Provision an account" description="Create a server-managed account with the least access it needs." onClose={() => !saving && setShowModal(false)}><form className="form-grid" onSubmit={createUser}>{formError && <div className="form-error full-width"><CircleAlert size={16} />{formError}</div>}<Field label="Full name" name="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Placement coordinator" required /><Field label="Email address" name="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} type="email" placeholder="coordinator@college.edu" required /><Field label="Temporary password" name="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} type="password" placeholder="At least 12 characters" required help="Share this securely; the server stores only a bcrypt hash." /><Field label="Role" name="role" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} options={[{ value: 'coordinator', label: 'Placement coordinator' }, { value: 'viewer', label: 'Viewer' }, { value: 'admin', label: 'Administrator' }]} required /><div className="modal-actions full-width"><button type="button" className="button button-light" onClick={() => setShowModal(false)} disabled={saving}>Cancel</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? <><LoaderCircle className="spin" size={16} /> Provisioning...</> : <><Check size={16} /> Create account</>}</button></div></form></Modal>}</div>
}

function LoginPage() {
  const { user, loading, login, authError } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [form, setForm] = useState({ email: '', password: '', remember: false })
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  if (!loading && user) return <Navigate to="/" replace />

  const submit = async (event) => {
    event.preventDefault()
    if (!form.email || !form.password) { setError('Enter your email and password to continue.'); return }
    setSubmitting(true); setError('')
    try { await login(form); navigate('/', { replace: true }) } catch (requestError) { setError(requestError.message) } finally { setSubmitting(false) }
  }

  return <div className="auth-page"><div className="auth-header"><Link className="brand-lockup auth-brand" to="/"><span className="brand-mark"><Sparkles size={19} /></span><div><strong>Campus<span>Flow</span></strong><small>PLACEMENT HUB</small></div></Link><button className="theme-toggle auth-theme" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>{theme === 'dark' ? '☀' : '☾'}</button></div><main className="login-layout"><section className="login-copy"><span className="eyebrow">Placement cell workspace</span><h1>Make every campus opportunity count.</h1><p>Manage students, hiring partners, job drives, and application outcomes from one calm, connected workspace.</p><div className="login-highlights"><div><span>01</span><strong>See the full pipeline</strong><small>From first application to final selection.</small></div><div><span>02</span><strong>Decide with live data</strong><small>Reports that reflect your real placement records.</small></div></div></section><section className="login-card"><div className="login-card-heading"><span className="login-icon"><GraduationCap size={21} /></span><span className="eyebrow">Welcome back</span><h2>Sign in to CampusFlow</h2><p>Use your placement cell account to continue.</p></div>{(error || authError) && <div className="form-error login-error" role="alert"><CircleAlert size={16} />{error || authError}</div>}<form className="login-form" onSubmit={submit}><Field label="Email address" name="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} type="email" placeholder="you@college.edu" required /><label className="field password-field"><span>Password<b>*</b></span><div><input name="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} type={showPassword ? 'text' : 'password'} placeholder="Enter your password" required /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label><div className="login-options"><label className="checkbox-label"><input type="checkbox" checked={form.remember} onChange={(event) => setForm({ ...form, remember: event.target.checked })} /> <span>Remember this device</span></label><button type="button" className="forgot-link" onClick={() => setError('Password recovery is not configured until a server-side email provider is added.')}>Forgot password?</button></div><button className="button button-primary login-button" type="submit" disabled={submitting}>{submitting ? <><LoaderCircle className="spin" size={17} /> Signing in...</> : 'Sign in to workspace'}</button></form><p className="login-note">Access is provisioned by an administrator. New accounts are not created from this page.</p></section></main></div>
}

function ProtectedLayout() {
  const { user, loading } = useAuth()
  if (loading) return <div className="auth-loading"><LoaderCircle className="spin" size={24} /><span>Restoring your secure session...</span></div>
  if (!user) return <Navigate to="/login" replace />
  return <AppShell />
}

export default function App() {
  return <Routes><Route path="/login" element={<LoginPage />} /><Route element={<ProtectedLayout />}><Route path="/" element={<Dashboard />} /><Route path="/students" element={<StudentsPage />} /><Route path="/companies" element={<CompaniesPage />} /><Route path="/jobs" element={<JobsPage />} /><Route path="/applications" element={<ApplicationsPage />} /><Route path="/reports" element={<ReportsPage />} /><Route path="/users" element={<UsersPage />} /><Route path="*" element={<NotFound />} /></Route></Routes>
}
