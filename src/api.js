const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api')
    .replace(/\/+$/, '')

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

let unauthorizedHandler = null

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler
}

async function request(path, options = {}) {
  const { body, signal: externalSignal, timeoutMs = 15000, ...requestOptions } = options
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  const abortFromCaller = () => controller.abort()
  externalSignal?.addEventListener('abort', abortFromCaller, { once: true })

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...requestOptions,
      credentials: 'include',
      signal: controller.signal,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...requestOptions.headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })

    const contentType = response.headers.get('content-type') || ''
    const payload = contentType.includes('application/json')
      ? await response.json()
      : await response.text()

    if (!response.ok) {
      if (response.status === 401 && unauthorizedHandler) unauthorizedHandler()
      const message = typeof payload === 'object' && payload !== null
        ? payload.message || payload.error
        : payload
      throw new ApiError(message || `Request failed with status ${response.status}.`, response.status)
    }

    if (options.method && options.method !== 'GET' && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('placement:data-changed', { detail: path }))
    return payload
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error.name === 'AbortError') throw new ApiError(`The request to ${path} timed out. Please retry.`, 408)
    throw new ApiError(`Unable to reach the placement API at ${API_BASE_URL}. Check that the backend is running.`)
  } finally {
    clearTimeout(timeoutId)
    externalSignal?.removeEventListener('abort', abortFromCaller)
  }
}

export function unwrapCollection(payload, keys = []) {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return []

  for (const key of [...keys, 'data', 'items', 'results']) {
    if (Array.isArray(payload[key])) return payload[key]
  }

  return []
}

export function unwrapObject(payload, keys = []) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {}
  for (const key of [...keys, 'data']) {
    if (payload[key] && typeof payload[key] === 'object' && !Array.isArray(payload[key])) return payload[key]
  }
  return payload
}

export const api = {
  login: ({ email, password, remember }) => request('/auth/login', { method: 'POST', body: { email, password, remember } }),
  getCurrentUser: () => request('/auth/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),
  getUsers: () => request('/users'),
  createUser: (user) => request('/users', { method: 'POST', body: user }),
  updateUserRole: (id, role) => request(`/users/${id}/role`, { method: 'PATCH', body: { role } }),
  updateUserStatus: (id, status) => request(`/users/${id}/status`, { method: 'PATCH', body: { status } }),
  getDashboardStats: () => request('/dashboard/stats'),
  getStudents: () => request('/students'),
  createStudent: (student) => request('/students', { method: 'POST', body: student }),
  updateStudent: (id, student) => request(`/students/${id}`, { method: 'PUT', body: student }),
  getCompanies: () => request('/companies'),
  createCompany: (company) => request('/companies', { method: 'POST', body: { company_name: company.name, industry: company.industry, location: company.location, website: company.website } }),
  getJobs: () => request('/jobs'),
  createJob: (job) => request('/jobs', { method: 'POST', body: { company_id: job.companyId, job_role: job.role, package_lpa: job.packageLpa, min_cgpa: job.minCgpa, job_location: job.location, deadline: job.deadline } }),
  getApplications: () => request('/applications'),
  createApplication: (application) => request('/applications', { method: 'POST', body: { student_id: application.studentId, job_id: application.jobId, ...(application.applicationDate ? { application_date: application.applicationDate } : {}) } }),
  updateApplicationStatus: (id, status) => request(`/applications/${id}/status`, { method: 'PATCH', body: { status: { applied: 'Applied', shortlisted: 'Shortlisted', rejected: 'Rejected', selected: 'Selected' }[String(status).toLowerCase()] || status } }),
}

export { API_BASE_URL }
