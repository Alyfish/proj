import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

// Always resolve the DB beside the repo root instead of process.cwd() so all packages share one file.
const DB_PATH = path.resolve(__dirname, '..', '..', 'email-assistant.db');

export class DB {
  private db: Database.Database;

  constructor() {
    this.db = new Database(DB_PATH);
    this.init();
  }

  private init() {
    // Users table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        preferences TEXT, -- JSON string
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Emails table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS emails (
        id TEXT PRIMARY KEY, -- Gmail Message ID
        user_id TEXT NOT NULL,
        thread_id TEXT,
        sender TEXT,
        subject TEXT,
        snippet TEXT,
        received_at DATETIME,
        labels TEXT, -- JSON array
        processed BOOLEAN DEFAULT 0,
        priority TEXT, -- 'high', 'medium', 'low'
        analysis TEXT, -- JSON string of analysis result
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
      )
    `);

    // Tasks table (Suggestions)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        source_email_id TEXT,
        title TEXT NOT NULL,
        description TEXT,
        due_date DATETIME,
        priority TEXT,
        status TEXT DEFAULT 'pending', -- 'pending', 'done', 'dismissed'
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(source_email_id) REFERENCES emails(id)
      )
    `);

    // Runs table (Batch execution logs)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        status TEXT, -- 'started', 'completed', 'failed'
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        metadata TEXT, -- JSON string
        FOREIGN KEY(user_id) REFERENCES users(id)
      )
    `);

    // Email Interactions table (Track user behavior)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS email_interactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        email_id TEXT NOT NULL,
        interaction_type TEXT, -- 'open', 'reply', 'archive', 'star', 'delete'
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        duration_seconds INTEGER, -- How long email was open
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(email_id) REFERENCES emails(id)
      )
    `);

    // User Goals table (Store active goals)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        goal_text TEXT NOT NULL,
        status TEXT DEFAULT 'active', -- 'active', 'completed', 'paused'
        confidence REAL DEFAULT 0.5, -- 0.0-1.0
        source TEXT, -- 'inferred', 'explicit', 'confirmed'
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
      )
    `);

    // Email-Goal Links table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS email_goal_links (
        email_id TEXT NOT NULL,
        goal_id INTEGER NOT NULL,
        relevance_score REAL DEFAULT 0.5, -- 0.0-1.0
        PRIMARY KEY(email_id, goal_id),
        FOREIGN KEY(email_id) REFERENCES emails(id),
        FOREIGN KEY(goal_id) REFERENCES user_goals(id)
      )
    `);

    // Embeddings cache table (stores vectors for semantic search)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS email_embeddings (
        email_id TEXT PRIMARY KEY,
        embedding TEXT, -- JSON array of numbers
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(email_id) REFERENCES emails(id)
      )
    `);
  }

  public getDb() {
    return this.db;
  }
}

export const db = new DB().getDb();
