export const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS resources (
    id          TEXT PRIMARY KEY,
    type        TEXT NOT NULL,
    title       TEXT NOT NULL,
    file_path   TEXT NOT NULL UNIQUE,
    cover_path  TEXT,
    rating         INTEGER DEFAULT 0,
    note           TEXT,
    meta           TEXT,
    added_at       INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL,
    open_count     INTEGER DEFAULT 0,
    total_run_time INTEGER DEFAULT 0,
    last_run_at    INTEGER,
    stat_paused    INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS tags (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS resource_tags (
    resource_id TEXT NOT NULL,
    tag_id      INTEGER NOT NULL,
    source      TEXT DEFAULT 'manual',
    PRIMARY KEY (resource_id, tag_id),
    FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS resources_fts USING fts5(
    title, note, content=resources, content_rowid=rowid
  );

  -- FTS5 同步触发器
  CREATE TRIGGER IF NOT EXISTS resources_fts_insert AFTER INSERT ON resources BEGIN
    INSERT INTO resources_fts(rowid, title, note)
    VALUES (new.rowid, new.title, COALESCE(new.note, ''));
  END;

  CREATE TRIGGER IF NOT EXISTS resources_fts_update AFTER UPDATE ON resources BEGIN
    INSERT INTO resources_fts(resources_fts, rowid, title, note)
    VALUES ('delete', old.rowid, old.title, COALESCE(old.note, ''));
    INSERT INTO resources_fts(rowid, title, note)
    VALUES (new.rowid, new.title, COALESCE(new.note, ''));
  END;

  CREATE TRIGGER IF NOT EXISTS resources_fts_delete AFTER DELETE ON resources BEGIN
    INSERT INTO resources_fts(resources_fts, rowid, title, note)
    VALUES ('delete', old.rowid, old.title, COALESCE(old.note, ''));
  END;

  CREATE TABLE IF NOT EXISTS ignored_paths (
    path TEXT PRIMARY KEY,
    added_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS blocked_dirs (
    path TEXT PRIMARY KEY
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS resource_content (
    resource_id  TEXT    PRIMARY KEY,
    text         TEXT,
    fetch_status TEXT    NOT NULL DEFAULT 'pending',
    is_truncated INTEGER NOT NULL DEFAULT 0,
    word_count   INTEGER NOT NULL DEFAULT 0,
    fetched_at   INTEGER,
    FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS resource_embeddings (
    resource_id TEXT    NOT NULL,
    chunk_index INTEGER NOT NULL,
    embedding   BLOB    NOT NULL,
    chunk_text  TEXT    NOT NULL,
    PRIMARY KEY (resource_id, chunk_index),
    FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
  );
`
