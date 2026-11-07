const path = require("node:path");
const { openDatabase } = require("../database/connection");
const { bootstrapAdmin } = require("../services/admin-bootstrap");

const dbPath = path.resolve(
  process.env.DB_PATH || path.join(__dirname, "..", "data", "database.sqlite")
);
const database = openDatabase(dbPath);

try {
  const result = bootstrapAdmin(database.db);
  console.log(JSON.stringify({
    action: result.action,
    adminId: result.admin.id,
    database: dbPath,
    passwordStoredAs: "salted scrypt hash",
    sessionsRevoked: result.sessionsRevoked,
    legacyAdminsRemoved: result.legacyAdminsRemoved
  }));
} finally {
  database.db.close();
}
