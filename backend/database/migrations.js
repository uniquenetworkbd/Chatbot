const migrations=[{version:1,name:"initial_schema",up(db){db.exec(`
CREATE TABLE IF NOT EXISTS chat_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,session_id TEXT NOT NULL,user_message TEXT NOT NULL,bot_response TEXT NOT NULL,category TEXT,created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE INDEX IF NOT EXISTS idx_chat_logs_session_created ON chat_logs(session_id,created_at DESC);
CREATE TABLE IF NOT EXISTS interaction_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,event_type TEXT NOT NULL,session_id TEXT,details TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE INDEX IF NOT EXISTS idx_interaction_logs_created ON interaction_logs(created_at DESC);
`);}},{version:2,name:"idempotent_client_events",up(db){for(const table of ["chat_logs","interaction_logs"]){const cols=db.prepare("PRAGMA table_info("+table+")").all();if(!cols.some(c=>c.name==="client_event_id"))db.exec("ALTER TABLE "+table+" ADD COLUMN client_event_id TEXT");}db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_logs_client_event ON chat_logs(client_event_id) WHERE client_event_id IS NOT NULL; CREATE UNIQUE INDEX IF NOT EXISTS idx_interaction_logs_client_event ON interaction_logs(client_event_id) WHERE client_event_id IS NOT NULL;");}},{version:3,name:"admin_authentication_sessions",up(db){db.exec(`
CREATE TABLE IF NOT EXISTS admins(id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT NOT NULL COLLATE NOCASE UNIQUE,password_hash TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TABLE IF NOT EXISTS admin_sessions(id INTEGER PRIMARY KEY AUTOINCREMENT,admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,token_hash TEXT NOT NULL UNIQUE,expires_at TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin ON admin_sessions(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry ON admin_sessions(expires_at);
`);}}, {version:4,name:"guest_conversations_and_messages",up(db){db.exec(`
CREATE TABLE IF NOT EXISTS guest_sessions(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 token_hash TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 last_seen_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS conversations(
 id TEXT PRIMARY KEY,
 guest_session_id INTEGER NOT NULL REFERENCES guest_sessions(id) ON DELETE RESTRICT,
 title TEXT NOT NULL DEFAULT 'নতুন কথোপকথন',
 topic_id TEXT,
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 last_message_at TEXT
);
CREATE TABLE IF NOT EXISTS messages(
 id TEXT PRIMARY KEY,
 conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
 sender TEXT NOT NULL CHECK(sender IN ('user','assistant')),
 content TEXT NOT NULL,
 topic_id TEXT,
 client_event_id TEXT,
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(conversation_id,client_event_id)
);
CREATE TABLE IF NOT EXISTS conversation_events(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
 event_type TEXT NOT NULL,
 event_data TEXT NOT NULL DEFAULT '{}',
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_conversations_guest_updated ON conversations(guest_session_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id,created_at,id);
CREATE INDEX IF NOT EXISTS idx_messages_content_search ON messages(conversation_id,content);
CREATE INDEX IF NOT EXISTS idx_conversation_events_conversation ON conversation_events(conversation_id,created_at);
`);}}, {version:5,name:"database_backup_registry",up(db){db.exec(`
CREATE TABLE IF NOT EXISTS backup_records(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 file_name TEXT NOT NULL UNIQUE,
 file_size INTEGER NOT NULL,
 checksum TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'created' CHECK(status IN ('created','verified','failed')),
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
`);}}];function migrate(db){db.exec("CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')))");const done=new Set(db.prepare("SELECT version FROM schema_migrations").all().map(x=>x.version));for(const m of migrations){if(done.has(m.version))continue;db.transaction(()=>{m.up(db);db.prepare("INSERT INTO schema_migrations(version,name) VALUES(?,?)").run(m.version,m.name);})();}return db.prepare("SELECT version,name,applied_at FROM schema_migrations ORDER BY version").all();}module.exports={migrate};
