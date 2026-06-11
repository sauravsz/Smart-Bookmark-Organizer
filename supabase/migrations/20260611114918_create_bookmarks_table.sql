CREATE TABLE bookmarks (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT,
  description TEXT,
  category TEXT,
  tags JSONB,
  domain TEXT,
  date_added TIMESTAMPTZ,
  is_favorite BOOLEAN DEFAULT FALSE,
  is_read_later BOOLEAN DEFAULT FALSE,
  og_image TEXT
);
