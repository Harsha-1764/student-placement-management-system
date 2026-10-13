const readline = require('node:readline/promises')
const { stdin: input, stdout: output } = require('node:process')
const bcrypt = require('bcryptjs')
const db = require('../src/config/db')

function normalizeEmail(email) { return String(email || '').trim().toLowerCase() }

async function main() {
  const rl = readline.createInterface({ input, output })
  try {
    const fullName = (await rl.question('Administrator full name: ')).trim()
    const email = normalizeEmail(await rl.question('Administrator email: '))
    const password = await rl.question('Administrator password (min 12 characters): ', { hideEchoBack: true })
    if (!fullName || !email || password.length < 12) throw new Error('Name, valid email, and a password of at least 12 characters are required.')
    const connection = await db.getConnection()
    try {
      const [existing] = await connection.execute('SELECT user_id FROM users WHERE email = ?', [email])
      if (existing.length) throw new Error('An account with this email already exists. No account was changed.')
      const [roleRows] = await connection.execute('SELECT role_id FROM roles WHERE role_name = ?', ['admin'])
      if (!roleRows.length) throw new Error('The admin role is not present. Run npm run migrate first.')
      const passwordHash = await bcrypt.hash(password, 12)
      await connection.beginTransaction()
      try {
        const [result] = await connection.execute('INSERT INTO users (full_name, email, password_hash) VALUES (?, ?, ?)', [fullName, email, passwordHash])
        await connection.execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [result.insertId, roleRows[0].role_id])
        await connection.commit()
        console.log('Administrator created. Store the credentials securely; they are not saved by this script.')
      } catch (error) {
        await connection.rollback()
        throw error
      }
    } finally {
      connection.release()
    }
  } finally {
    rl.close()
    await db.end()
  }
}

main().catch((error) => {
  console.error(`Bootstrap failed: ${error.message}`)
  process.exitCode = 1
})
