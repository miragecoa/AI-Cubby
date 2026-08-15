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
    stat_paused    INTEGER DEFAULT 0,
    missing_at     INTEGER DEFAULT 0,
    last_path_check_at INTEGER DEFAULT 0
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

  CREATE TABLE IF NOT EXISTS search_resource_affinity (
    query_key        TEXT NOT NULL,
    query_text       TEXT NOT NULL,
    resource_id      TEXT NOT NULL,
    score            REAL NOT NULL DEFAULT 1,
    positive_count   INTEGER NOT NULL DEFAULT 0,
    exposure_count   INTEGER NOT NULL DEFAULT 0,
    skip_count       INTEGER NOT NULL DEFAULT 0,
    created_at       INTEGER NOT NULL,
    updated_at       INTEGER NOT NULL,
    last_positive_at INTEGER NOT NULL,
    PRIMARY KEY (query_key, resource_id),
    FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_search_affinity_query_score
    ON search_resource_affinity(query_key, score DESC);

  CREATE TABLE IF NOT EXISTS search_learning_judgments (
    id                   TEXT PRIMARY KEY,
    resource_id          TEXT NOT NULL,
    source               TEXT NOT NULL,
    candidate_queries    TEXT NOT NULL,
    resource_snapshot    TEXT NOT NULL,
    status               TEXT NOT NULL DEFAULT 'pending',
    matched_query_key    TEXT,
    confidence           REAL,
    model                TEXT,
    created_at           INTEGER NOT NULL,
    expires_at           INTEGER NOT NULL,
    resolved_at          INTEGER,
    FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_search_judgments_status_created
    ON search_learning_judgments(status, created_at DESC);
`
