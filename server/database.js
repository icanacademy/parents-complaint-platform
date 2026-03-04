const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'complaints.db');
const db = new sqlite3.Database(dbPath);

// Initialize database tables
const initializeDatabase = () => {
  db.serialize(() => {
    // Parents table
    db.run(`CREATE TABLE IF NOT EXISTS parents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Categories table
    db.run(`CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      color TEXT DEFAULT '#3B82F6'
    )`);

    // Staff table
    db.run(`CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      role TEXT DEFAULT 'staff',
      department TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Complaints table
    db.run(`CREATE TABLE IF NOT EXISTS complaints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_number TEXT UNIQUE NOT NULL,
      parent_id INTEGER,
      category_id INTEGER,
      assigned_to INTEGER,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      student_name TEXT,
      student_number TEXT,
      teacher_name TEXT,
      teacher_number TEXT,
      grade_level TEXT,
      priority TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'open',
      process_taken TEXT,
      solution TEXT,
      attachments TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME,
      FOREIGN KEY (parent_id) REFERENCES parents (id),
      FOREIGN KEY (category_id) REFERENCES categories (id),
      FOREIGN KEY (assigned_to) REFERENCES staff (id)
    )`);

    // Comments/Updates table
    db.run(`CREATE TABLE IF NOT EXISTS complaint_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_id INTEGER,
      staff_id INTEGER,
      update_type TEXT DEFAULT 'comment',
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (complaint_id) REFERENCES complaints (id),
      FOREIGN KEY (staff_id) REFERENCES staff (id)
    )`);

    // Resolution Steps table - tracks the investigative pipeline
    db.run(`CREATE TABLE IF NOT EXISTS resolution_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_id INTEGER,
      step_name TEXT NOT NULL,
      step_order INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      data TEXT,
      ai_generated BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (complaint_id) REFERENCES complaints (id)
    )`);

    // Linked Entities table - connects complaints to Notion entities
    db.run(`CREATE TABLE IF NOT EXISTS linked_entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_id INTEGER,
      entity_type TEXT NOT NULL,
      notion_id TEXT,
      entity_data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (complaint_id) REFERENCES complaints (id)
    )`);

    // Add complexity column to existing complaints table if it doesn't exist
    db.run(`ALTER TABLE complaints ADD COLUMN complexity TEXT DEFAULT 'complex'`, (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.log('Note: Complexity column might already exist or there was an issue:', err.message);
      }
    });

    // Insert default categories
    const defaultCategories = [
      ['Academic Issues', 'Concerns about curriculum, teaching methods, or academic performance', '#EF4444'],
      ['Bullying/Safety', 'Reports of bullying, harassment, or safety concerns', '#DC2626'],
      ['Communication', 'Issues with school communication or lack of information', '#F59E0B'],
      ['Facilities', 'Problems with school buildings, equipment, or facilities', '#10B981'],
      ['Transportation', 'School bus or transportation related complaints', '#3B82F6'],
      ['Food Services', 'Complaints about school meals or food quality', '#8B5CF6'],
      ['Special Needs', 'Issues related to special education or accommodation needs', '#F97316'],
      ['Disciplinary Actions', 'Concerns about school discipline policies or actions', '#84CC16'],
      ['Extracurricular', 'Issues with sports, clubs, or after-school activities', '#06B6D4'],
      ['Other', 'General complaints that don\'t fit other categories', '#6B7280']
    ];

    const insertCategory = db.prepare("INSERT OR IGNORE INTO categories (name, description, color) VALUES (?, ?, ?)");
    defaultCategories.forEach(category => {
      insertCategory.run(category);
    });
    insertCategory.finalize();

    // Insert default staff
    const insertStaff = db.prepare("INSERT OR IGNORE INTO staff (name, email, role, department) VALUES (?, ?, ?, ?)");
    insertStaff.run('ICAN Frontdesk', 'frontdesk@gmail.com', 'admin', 'Administration');
    insertStaff.run('Ms. Nicole', 'msnicole@ican.com', 'vice president', 'Student Services');
    insertStaff.run('Mr. Bruce', 'mrbruce@ican.com', 'principal', 'Executive');
    insertStaff.finalize();
  });
};

// Generate unique ticket number
const generateTicketNumber = () => {
  const prefix = 'PC';
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${prefix}${timestamp}${random}`;
};

module.exports = {
  db,
  initializeDatabase,
  generateTicketNumber
};