const test = require('node:test')
const assert = require('node:assert/strict')
const app = require('../server')

let server
let baseUrl

test.before(async () => {
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

test('exposes a health-independent API root', async () => {
  const response = await fetch(`${baseUrl}/`)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { message: 'Student Placement Management API is running' })
})

test('requires a session before placement data can be read', async () => {
  const response = await fetch(`${baseUrl}/api/students`)
  assert.equal(response.status, 401)
  assert.equal((await response.json()).error, 'Authentication required')
})

test('protects administrator account management', async () => {
  const response = await fetch(`${baseUrl}/api/users`)
  assert.equal(response.status, 401)
})

test.after(async () => {
  await new Promise((resolve) => server.close(resolve))
})
