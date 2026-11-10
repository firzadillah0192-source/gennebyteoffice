CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL,   -- main | platform | department
  theme TEXT NOT NULL, ord INT NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS bots (
  id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, role TEXT NOT NULL,
  room_id TEXT NOT NULL REFERENCES rooms(id),
  backend TEXT NOT NULL DEFAULT 'router',                         -- router | claude
  look JSONB NOT NULL DEFAULT '{}', chat_url TEXT,
  token_hash TEXT,                                                -- sha256 token bot
  status TEXT NOT NULL DEFAULT 'idle', step TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY, bot_id TEXT REFERENCES bots(id),
  status TEXT NOT NULL, step TEXT NOT NULL, at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_at ON events(at DESC);
CREATE TABLE IF NOT EXISTS approvals (
  id BIGSERIAL PRIMARY KEY, bot_id TEXT NOT NULL REFERENCES bots(id),
  action TEXT NOT NULL, detail JSONB NOT NULL DEFAULT '{}',
  state TEXT NOT NULL DEFAULT 'pending',                          -- pending | approved | rejected
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), decided_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v BIGINT NOT NULL);
INSERT INTO meta VALUES ('version',0) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS tasks (
  id BIGSERIAL PRIMARY KEY, bot_id TEXT NOT NULL REFERENCES bots(id),
  instruction TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'queued',  -- queued | running | done | failed
  result TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS tasks_queue ON tasks(bot_id, state, id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS from_bot TEXT;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS visit_room TEXT;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS visit_until TIMESTAMPTZ;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS remote BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS ledger_entries (
  id BIGSERIAL PRIMARY KEY, entry_date DATE NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('in','out')),
  amount BIGINT NOT NULL CHECK (amount > 0), category TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',                      -- pending | booked | void
  proposed_by TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), decided_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ledger_date ON ledger_entries(entry_date, status);
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS ref_ledger BIGINT;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS standing TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS routines (
  id BIGSERIAL PRIMARY KEY, bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  name TEXT NOT NULL, instruction TEXT NOT NULL,
  every_minutes INT NOT NULL CHECK (every_minutes >= 60 AND every_minutes <= 10080),
  enabled BOOLEAN NOT NULL DEFAULT false,
  window_start SMALLINT NOT NULL DEFAULT 7, window_end SMALLINT NOT NULL DEFAULT 22,
  last_run TIMESTAMPTZ, next_run TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS routines_due ON routines(enabled, next_run);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS routine_id BIGINT;
