const fs = require('node:fs/promises')
const path = require('node:path')
const db = require('../src/config/db')

async function ensureMigrationTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(120) NOT NULL PRIMARY KEY,
      checksum CHAR(64) NOT NULL,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `)
}

async function main() {
  const connection = await db.getConnection()
  let lockAcquired = false
  try {
    const [lockRows] = await connection.query('SELECT GET_LOCK(?, 30) AS acquired', ['student-placement-migrations'])
    lockAcquired = Number(lockRows[0]?.acquired) === 1
    if (!lockAcquired) throw new Error('Could not acquire the database migration lock.')
    await ensureMigrationTable(connection)
    const migrationDirectory = path.join(__dirname, '..', 'migrations')
    const files = (await fs.readdir(migrationDirectory)).filter((file) => file.endsWith('.sql')).sort()
    const [applied] = await connection.query('SELECT version, checksum FROM schema_migrations')
    const appliedMap = new Map(applied.map((row) => [row.version, row.checksum]))

    for (const file of files) {
      const version = file.replace(/\.sql$/, '')
      const sql = await fs.readFile(path.join(migrationDirectory, file), 'utf8')
      const checksum = require('node:crypto').createHash('sha256').update(sql).digest('hex')
      if (appliedMap.has(version)) {
        if (appliedMap.get(version) !== checksum) throw new Error(`Migration ${version} changed after it was applied.`)
        continue
      }
      await connection.beginTransaction()
      try {
        const statements = sql.split(/;\s*(?:\r?\n|$)/).map((statement) => statement.trim()).filter(Boolean)
        for (const statement of statements) await connection.query(statement)
        await connection.execute('INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)', [version, checksum])
        await connection.commit()
        console.log(`Applied ${version}`)
      } catch (error) {
        await connection.rollback()
        throw error
      }
    }
    console.log('Database migrations are up to date.')
  } finally {
    if (lockAcquired) await connection.query('SELECT RELEASE_LOCK(?)', ['student-placement-migrations']).catch(() => {})
    connection.release()
    await db.end()
  }
}

main().catch((error) => {
  console.error(`Migration failed: ${error.message}`)
  process.exitCode = 1
})
