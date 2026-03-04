require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { db, initializeDatabase, generateTicketNumber } = require('./database');
const { body, validationResult } = require('express-validator');
const moment = require('moment');
const { Client } = require('@notionhq/client');
const OpenAI = require('openai');
const PDFDocument = require('pdfkit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

// Initialize Notion client
const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

// Initialize OpenAI client with cost-effective model
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Helper function to create fallback solution
function createFallbackSolution(caseData) {
  return {
    solution: `Recommended approach for ${caseData.category} complaint: Immediate investigation and stakeholder meeting to address the reported issue.`,
    actionSteps: [
      "Schedule meeting with all relevant parties within 2 business days",
      "Investigate the specific circumstances described in the complaint",
      "Develop action plan based on findings and school policies",
      "Implement corrective measures and document outcomes"
    ],
    preventionMeasures: [
      "Review current policies and procedures related to this category",
      "Provide additional training to staff if needed",
      "Establish monitoring system to prevent recurrence"
    ],
    timeline: `${caseData.priority === 'high' ? '2-3 business days' : '5-7 business days'}`,
    stakeholders: ["Assigned staff member", "School administrator", "Parent/Guardian", "Student (if appropriate)"],
    followUp: "Schedule follow-up meeting within 2 weeks to ensure resolution effectiveness"
  };
}

// Helper function to create fallback insights
function createFallbackInsights(analysisData) {
  const categories = [...new Set(analysisData.map(d => d.category))];
  const priorities = [...new Set(analysisData.map(d => d.priority))];
  const totalComplaints = analysisData.length;
  const openComplaints = analysisData.filter(d => !d.resolved).length;
  
  return {
    insights: [
      `Analyzed ${totalComplaints} recent complaints across ${categories.length} categories`,
      `${openComplaints} complaints remain unresolved (${Math.round(openComplaints/totalComplaints*100)}%)`,
      `Most frequent priority levels: ${priorities.join(', ')}`
    ],
    recommendations: [
      `Focus on resolving ${openComplaints} pending complaints to improve resolution rate`,
      `Review complaint patterns in categories: ${categories.slice(0, 3).join(', ')}`,
      `Implement systematic tracking for ${priorities.includes('high') ? 'high-priority' : 'all'} complaints`
    ],
    patterns: [
      `Complaints span multiple categories: ${categories.join(', ')}`,
      `Priority distribution includes: ${priorities.join(', ')} level complaints`,
      `Average age of complaints varies, suggesting different resolution timeframes`
    ]
  };
}

// AI Classification and Resolution Step Generator
async function generateResolutionSteps(complaintData) {
  try {
    const isSimple = complaintData.complexity === 'simple';
    
    const prompt = `Analyze this school ${isSimple ? 'simple request' : 'complex complaint'} and generate a structured resolution process.

Complaint Details:
- Title: "${complaintData.title}"
- Description: "${complaintData.description}"
- Category: "${complaintData.category}"  
- Priority: "${complaintData.priority}"
- Student: "${complaintData.student_name || 'Not specified'}"
- Teacher: "${complaintData.teacher_name || 'Not specified'}"
- Grade: "${complaintData.grade_level || 'Not specified'}"
- Complexity: "${complaintData.complexity || 'complex'}"

${isSimple ? 
  'SIMPLE REQUEST: Generate only 1-2 resolution steps for quick handling (e.g., Review Request → Provide Response)' : 
  'COMPLEX ISSUE: Generate a comprehensive 4-6 step resolution process for thorough investigation and resolution'
}

IMPORTANT: Respond with ONLY a valid JSON object in this exact format (no other text):
{
  "classification": {
    "category": "refined category classification",
    "priority": "low|medium|high", 
    "urgency": "immediate|within_24h|within_week|routine",
    "summary": "brief one-sentence summary of the issue"
  },
  "stakeholders": ["list of people/roles who should be involved"],
  "resolutionSteps": [
    ${isSimple ? `
    {
      "stepName": "Review Request",
      "stepOrder": 1, 
      "description": "Review and process the request",
      "estimatedDays": 1,
      "aiGenerated": true
    },
    {
      "stepName": "Provide Response",
      "stepOrder": 2,
      "description": "Communicate resolution or next steps to parent", 
      "estimatedDays": 1,
      "aiGenerated": true
    }` : `
    {
      "stepName": "Intake",
      "stepOrder": 1, 
      "description": "Initial complaint receipt and documentation",
      "estimatedDays": 1,
      "aiGenerated": true
    },
    {
      "stepName": "Classification",
      "stepOrder": 2,
      "description": "Categorize and prioritize the complaint", 
      "estimatedDays": 1,
      "aiGenerated": true
    },
    {
      "stepName": "Investigation", 
      "stepOrder": 3,
      "description": "Gather facts and interview relevant parties",
      "estimatedDays": 3,
      "aiGenerated": true
    },
    {
      "stepName": "Resolution",
      "stepOrder": 4,
      "description": "Implement solution and communicate with stakeholders", 
      "estimatedDays": 2,
      "aiGenerated": true
    }`}
  ],
  "similarCases": "brief description of similar ${isSimple ? 'request' : 'complaint'} patterns",
  "recommendations": ["specific actionable recommendations"],
  "riskAssessment": "low|medium|high risk level with brief explanation"
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system", 
          content: "You are an expert school administrator and complaint resolution specialist. Provide structured, actionable resolution processes."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 1200,
      temperature: 0.3
    });

    const rawResponse = completion.choices[0].message.content;
    console.log('AI Classification Raw Response:', rawResponse);

    try {
      const aiResponse = JSON.parse(rawResponse);
      return aiResponse;
    } catch (parseError) {
      console.log('AI Classification parsing failed:', parseError.message);
      
      // Try to extract JSON from response
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (secondError) {
          return createFallbackResolutionSteps(complaintData);
        }
      } else {
        return createFallbackResolutionSteps(complaintData);
      }
    }

  } catch (error) {
    console.error('AI Classification error:', error);
    return createFallbackResolutionSteps(complaintData);
  }
}

// Helper function to create fallback resolution steps
function createFallbackResolutionSteps(complaintData) {
  const isSimple = complaintData.complexity === 'simple';
  
  const simpleSteps = [
    {
      stepName: "Review Request",
      stepOrder: 1,
      description: "Review and process the request",
      estimatedDays: 1,
      aiGenerated: true
    },
    {
      stepName: "Provide Response",
      stepOrder: 2,
      description: "Communicate resolution or next steps to parent",
      estimatedDays: 1,
      aiGenerated: true
    }
  ];

  const complexSteps = [
    {
      stepName: "Intake",
      stepOrder: 1,
      description: "Initial complaint receipt and documentation",
      estimatedDays: 1,
      aiGenerated: true
    },
    {
      stepName: "Classification", 
      stepOrder: 2,
      description: "Categorize and prioritize the complaint",
      estimatedDays: 1,
      aiGenerated: true
    },
    {
      stepName: "Investigation",
      stepOrder: 3,
      description: "Gather facts and interview relevant parties",
      estimatedDays: 3,
      aiGenerated: true
    },
    {
      stepName: "Resolution",
      stepOrder: 4,
      description: "Implement solution and communicate with stakeholders",
      estimatedDays: 2,
      aiGenerated: true
    },
    {
      stepName: "Follow-up",
      stepOrder: 5,
      description: "Monitor implementation and gather feedback",
      estimatedDays: 7,
      aiGenerated: true
    }
  ];

  return {
    classification: {
      category: complaintData.category,
      priority: complaintData.priority,
      urgency: complaintData.priority === 'high' ? 'within_24h' : 'within_week',
      summary: `${complaintData.category} ${isSimple ? 'request' : 'complaint'} requiring ${isSimple ? 'quick processing' : 'investigation and resolution'}`
    },
    stakeholders: isSimple ? ["Assigned staff member", "Parent/Guardian"] : ["Assigned staff member", "School administrator", "Parent/Guardian"],
    resolutionSteps: isSimple ? simpleSteps : complexSteps,
    similarCases: `Standard ${isSimple ? 'request' : 'complaint'} resolution process`,
    recommendations: isSimple ? ["Review request promptly", "Provide clear response"] : ["Schedule stakeholder meeting", "Document all findings", "Follow school policies"],
    riskAssessment: isSimple ? "low - straightforward request requiring prompt response" : "medium - requires proper documentation and stakeholder communication"
  };
}

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors({
  origin: [
    'http://parentrequest.ican.com',
    'http://localhost:5050',
    'http://localhost:3000'
  ],
  credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client/build')));

// Initialize database
initializeDatabase();

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Rate limiter for AI endpoints
const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many AI requests. Please try again in a minute.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Auth: JWT middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
};

// Auth: Login endpoint (must be BEFORE the auth middleware)
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password is required' });

  const pinHash = process.env.AUTH_PIN_HASH;
  if (!pinHash) return res.status(500).json({ error: 'Server auth not configured' });

  if (!bcrypt.compareSync(password, pinHash)) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '24h' });
  res.json({ token });
});

// Protect all /api routes (login route is already registered above)
app.use('/api', authenticateToken);

// API Routes

// Get all complaints with pagination and filtering
app.get('/api/complaints', (req, res) => {
  const { page = 1, limit = 10, status, category, priority, search, student, teacher } = req.query;
  const offset = (page - 1) * limit;
  
  let query = `
    SELECT c.*, p.name as parent_name, p.email as parent_email, 
           cat.name as category_name, cat.color as category_color,
           s.name as assigned_staff_name
    FROM complaints c
    LEFT JOIN parents p ON c.parent_id = p.id
    LEFT JOIN categories cat ON c.category_id = cat.id
    LEFT JOIN staff s ON c.assigned_to = s.id
    WHERE 1=1
  `;
  
  const params = [];
  
  if (status) {
    query += ' AND c.status = ?';
    params.push(status);
  }
  
  if (category) {
    query += ' AND c.category_id = ?';
    params.push(category);
  }
  
  if (priority) {
    query += ' AND c.priority = ?';
    params.push(priority);
  }
  
  if (search) {
    query += ' AND (c.title LIKE ? OR c.description LIKE ? OR p.name LIKE ? OR c.student_name LIKE ? OR c.teacher_name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  
  if (student) {
    query += ' AND c.student_name LIKE ?';
    params.push(`%${student}%`);
  }
  
  if (teacher) {
    query += ' AND c.teacher_name LIKE ?';
    params.push(`%${teacher}%`);
  }
  
  query += ' ORDER BY c.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), offset);
  
  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) as total FROM complaints c LEFT JOIN parents p ON c.parent_id = p.id WHERE 1=1';
    const countParams = params.slice(0, -2); // Remove limit and offset
    
    if (status) countQuery += ' AND c.status = ?';
    if (category) countQuery += ' AND c.category_id = ?';
    if (priority) countQuery += ' AND c.priority = ?';
    if (search) countQuery += ' AND (c.title LIKE ? OR c.description LIKE ? OR p.name LIKE ? OR c.student_name LIKE ? OR c.teacher_name LIKE ?)';
    if (student) countQuery += ' AND c.student_name LIKE ?';
    if (teacher) countQuery += ' AND c.teacher_name LIKE ?';
    
    db.get(countQuery, countParams, (err, countRow) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      res.json({
        complaints: rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: countRow.total,
          totalPages: Math.ceil(countRow.total / limit)
        }
      });
    });
  });
});

// Get single complaint with updates
app.get('/api/complaints/:id', (req, res) => {
  const complaintId = req.params.id;
  
  const complaintQuery = `
    SELECT c.*, p.name as parent_name, p.email as parent_email, p.phone as parent_phone,
           cat.name as category_name, cat.color as category_color,
           s.name as assigned_staff_name
    FROM complaints c
    LEFT JOIN parents p ON c.parent_id = p.id
    LEFT JOIN categories cat ON c.category_id = cat.id
    LEFT JOIN staff s ON c.assigned_to = s.id
    WHERE c.id = ?
  `;
  
  db.get(complaintQuery, [complaintId], (err, complaint) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found' });
    }
    
    // Get complaint updates
    const updatesQuery = `
      SELECT cu.*, s.name as staff_name
      FROM complaint_updates cu
      LEFT JOIN staff s ON cu.staff_id = s.id
      WHERE cu.complaint_id = ?
      ORDER BY cu.created_at DESC
    `;
    
    db.all(updatesQuery, [complaintId], (err, updates) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      res.json({ ...complaint, updates });
    });
  });
});

// Create new complaint
app.post('/api/complaints', [
  body('parent_name').notEmpty().withMessage('Parent name is required'),
  body('student_name').notEmpty().withMessage('Student name is required'),
  body('title').notEmpty().withMessage('Title is required'),
  body('description').notEmpty().withMessage('Description is required'),
  body('category_id').isInt().withMessage('Category is required')
], handleValidationErrors, (req, res) => {
  const {
    parent_name, parent_phone, parent_address,
    title, description, category_id, priority = 'medium',
    student_name, student_number, teacher_name, teacher_number, grade_level,
    complexity = 'complex'
  } = req.body;
  
  const ticketNumber = generateTicketNumber();
  
  // First, insert or get parent
  const parentQuery = 'INSERT OR IGNORE INTO parents (name, phone, address) VALUES (?, ?, ?)';
  db.run(parentQuery, [parent_name, parent_phone, parent_address], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    // Get parent ID - search by name
    const getParentQuery = 'SELECT id FROM parents WHERE name = ?';
    const getParentParams = [parent_name];
    
    db.get(getParentQuery, getParentParams, (err, parent) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      // Insert complaint
      const complaintQuery = `
        INSERT INTO complaints (ticket_number, parent_id, category_id, title, description, priority, student_name, student_number, teacher_name, teacher_number, grade_level, complexity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      db.run(complaintQuery, [ticketNumber, parent.id, category_id, title, description, priority, student_name, student_number, teacher_name, teacher_number, grade_level, complexity], async function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        
        const complaintId = this.lastID;
        
        // Generate AI-powered resolution steps asynchronously
        try {
          // Get category name for AI processing
          const categoryQuery = 'SELECT name FROM categories WHERE id = ?';
          db.get(categoryQuery, [category_id], async (err, categoryRow) => {
            if (!err && categoryRow) {
              const complaintData = {
                title,
                description,
                category: categoryRow.name,
                priority,
                student_name,
                teacher_name,
                grade_level,
                complexity
              };
              
              // Generate AI classification and resolution steps
              const aiResolution = await generateResolutionSteps(complaintData);
              
              // Insert resolution steps
              const insertStepQuery = `
                INSERT INTO resolution_steps (complaint_id, step_name, step_order, status, data, ai_generated)
                VALUES (?, ?, ?, ?, ?, ?)
              `;
              
              if (aiResolution.resolutionSteps) {
                aiResolution.resolutionSteps.forEach((step, index) => {
                  const stepData = {
                    description: step.description,
                    estimatedDays: step.estimatedDays,
                    classification: index === 0 ? aiResolution.classification : null,
                    stakeholders: index === 0 ? aiResolution.stakeholders : null,
                    recommendations: index === 0 ? aiResolution.recommendations : null,
                    riskAssessment: index === 0 ? aiResolution.riskAssessment : null,
                    similarCases: index === 0 ? aiResolution.similarCases : null
                  };
                  
                  db.run(insertStepQuery, [
                    complaintId,
                    step.stepName,
                    step.stepOrder,
                    index === 0 ? 'completed' : 'pending', // First step (Intake) is auto-completed
                    JSON.stringify(stepData),
                    step.aiGenerated
                  ], (err) => {
                    if (err) {
                      console.error('Error inserting resolution step:', err);
                    }
                  });
                });
              }
              
              // Auto-link student and teacher entities if they exist in Notion
              if (student_name) {
                const studentEntityData = {
                  name: student_name,
                  student_number: student_number,
                  grade_level: grade_level
                };
                
                db.run(
                  'INSERT INTO linked_entities (complaint_id, entity_type, entity_data) VALUES (?, ?, ?)',
                  [complaintId, 'student', JSON.stringify(studentEntityData)],
                  (err) => {
                    if (err) console.error('Error linking student entity:', err);
                  }
                );
              }
              
              if (teacher_name) {
                const teacherEntityData = {
                  name: teacher_name,
                  teacher_number: teacher_number
                };
                
                db.run(
                  'INSERT INTO linked_entities (complaint_id, entity_type, entity_data) VALUES (?, ?, ?)',
                  [complaintId, 'teacher', JSON.stringify(teacherEntityData)],
                  (err) => {
                    if (err) console.error('Error linking teacher entity:', err);
                  }
                );
              }
            }
          });
        } catch (aiError) {
          console.error('AI processing error:', aiError);
          // Continue without AI processing
        }
        
        res.status(201).json({
          id: complaintId,
          ticket_number: ticketNumber,
          message: 'Complaint submitted successfully'
        });
      });
    });
  });
});

// Update complaint
app.put('/api/complaints/:id', [
  body('title').optional().notEmpty(),
  body('description').optional().notEmpty()
], handleValidationErrors, (req, res) => {
  const complaintId = req.params.id;
  const updates = req.body;
  
  const ALLOWED_FIELDS = ['status', 'assigned_to', 'priority', 'process_taken', 'solution', 'title', 'description'];
  const fields = [];
  const values = [];

  Object.keys(updates).forEach(key => {
    if (updates[key] !== undefined && ALLOWED_FIELDS.includes(key)) {
      fields.push(`${key} = ?`);
      values.push(updates[key]);
    }
  });

  if (fields.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }
  
  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(complaintId);
  
  const query = `UPDATE complaints SET ${fields.join(', ')} WHERE id = ?`;
  
  db.run(query, values, function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Complaint not found' });
    }
    
    res.json({ message: 'Complaint updated successfully' });
  });
});

// Add complaint update/comment
app.post('/api/complaints/:id/updates', [
  body('message').notEmpty().withMessage('Message is required'),
  body('staff_id').isInt().withMessage('Staff ID is required'),
  body('update_type').optional().isIn(['comment', 'status_change', 'assignment'])
], handleValidationErrors, (req, res) => {
  const complaintId = req.params.id;
  const { message, staff_id, update_type = 'comment' } = req.body;
  
  const query = `
    INSERT INTO complaint_updates (complaint_id, staff_id, update_type, message)
    VALUES (?, ?, ?, ?)
  `;
  
  db.run(query, [complaintId, staff_id, update_type, message], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    res.status(201).json({
      id: this.lastID,
      message: 'Update added successfully'
    });
  });
});

// Get resolution steps for a complaint
app.get('/api/complaints/:id/resolution-steps', (req, res) => {
  const complaintId = req.params.id;
  
  const query = `
    SELECT rs.*, s.name as staff_name
    FROM resolution_steps rs
    LEFT JOIN staff s ON JSON_EXTRACT(rs.data, '$.staff_id') = s.id
    WHERE rs.complaint_id = ?
    ORDER BY rs.step_order ASC, rs.created_at ASC
  `;
  
  db.all(query, [complaintId], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    // Parse JSON data for each step
    const steps = rows.map(row => ({
      ...row,
      data: row.data ? JSON.parse(row.data) : null
    }));
    
    res.json(steps);
  });
});

// Add or update resolution step
app.post('/api/complaints/:id/resolution-step', [
  body('step_name').notEmpty().withMessage('Step name is required'),
  body('step_order').isInt().withMessage('Step order must be a number'),
  body('data').optional().isObject()
], handleValidationErrors, (req, res) => {
  const complaintId = req.params.id;
  const { step_name, step_order, status = 'pending', data = {}, ai_generated = false } = req.body;
  
  const query = `
    INSERT INTO resolution_steps (complaint_id, step_name, step_order, status, data, ai_generated)
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  
  db.run(query, [complaintId, step_name, step_order, status, JSON.stringify(data), ai_generated], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    res.status(201).json({
      id: this.lastID,
      message: 'Resolution step added successfully'
    });
  });
});

// Update resolution step status
app.put('/api/complaints/:complaintId/resolution-steps/:stepId', [
  body('status').optional().isIn(['pending', 'in_progress', 'completed', 'skipped']),
  body('data').optional().isObject()
], handleValidationErrors, (req, res) => {
  const { complaintId, stepId } = req.params;
  const { status, data } = req.body;
  
  const updates = [];
  const params = [];
  
  if (status) {
    updates.push('status = ?');
    params.push(status);
    
    if (status === 'completed') {
      updates.push('completed_at = ?');
      params.push(new Date().toISOString());
    }
  }
  
  if (data) {
    updates.push('data = ?');
    params.push(JSON.stringify(data));
  }
  
  if (updates.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }
  
  params.push(stepId, complaintId);
  
  const query = `UPDATE resolution_steps SET ${updates.join(', ')} WHERE id = ? AND complaint_id = ?`;
  
  db.run(query, params, function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Resolution step not found' });
    }
    
    res.json({ message: 'Resolution step updated successfully' });
  });
});

// Get linked entities for a complaint
app.get('/api/complaints/:id/linked-entities', (req, res) => {
  const complaintId = req.params.id;
  
  const query = `
    SELECT * FROM linked_entities 
    WHERE complaint_id = ?
    ORDER BY entity_type, created_at
  `;
  
  db.all(query, [complaintId], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    // Parse JSON entity_data for each linked entity
    const entities = rows.map(row => ({
      ...row,
      entity_data: row.entity_data ? JSON.parse(row.entity_data) : null
    }));
    
    res.json(entities);
  });
});

// Add linked entity to complaint
app.post('/api/complaints/:id/linked-entity', [
  body('entity_type').notEmpty().withMessage('Entity type is required'),
  body('notion_id').optional(),
  body('entity_data').optional().isObject()
], handleValidationErrors, (req, res) => {
  const complaintId = req.params.id;
  const { entity_type, notion_id, entity_data = {} } = req.body;
  
  const query = `
    INSERT INTO linked_entities (complaint_id, entity_type, notion_id, entity_data)
    VALUES (?, ?, ?, ?)
  `;
  
  db.run(query, [complaintId, entity_type, notion_id, JSON.stringify(entity_data)], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    res.status(201).json({
      id: this.lastID,
      message: 'Linked entity added successfully'
    });
  });
});

// AI-powered insights endpoint
app.get('/api/ai-insights', aiRateLimiter, async (req, res) => {
  try {
    // Get recent complaints data for analysis
    const recentComplaints = await new Promise((resolve, reject) => {
      const query = `
        SELECT c.*, p.name as parent_name, cat.name as category_name, s.name as assigned_staff_name
        FROM complaints c
        LEFT JOIN parents p ON c.parent_id = p.id
        LEFT JOIN categories cat ON c.category_id = cat.id
        LEFT JOIN staff s ON c.assigned_to = s.id
        WHERE c.created_at >= date('now', '-30 days')
        ORDER BY c.created_at DESC
        LIMIT 50
      `;
      
      db.all(query, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    if (recentComplaints.length === 0) {
      return res.json({ 
        insights: ["No recent complaints to analyze."],
        recommendations: ["Continue monitoring complaint patterns."],
        patterns: []
      });
    }

    // Prepare data for AI analysis (anonymized)
    const analysisData = recentComplaints.map(complaint => ({
      category: complaint.category_name,
      priority: complaint.priority,
      status: complaint.status,
      studentGrade: complaint.grade_level,
      daysSinceCreated: Math.floor((Date.now() - new Date(complaint.created_at)) / (1000 * 60 * 60 * 24)),
      resolved: complaint.status === 'resolved'
    }));

    // Create AI prompt for analysis
    const prompt = `Analyze this school complaint data and provide actionable insights.

Data: ${JSON.stringify(analysisData, null, 2)}

IMPORTANT: Respond with ONLY a valid JSON object in this exact format (no other text):
{
  "insights": ["specific insight about the data", "another key finding", "third important insight"],
  "recommendations": ["specific action to take", "another actionable recommendation", "third recommendation"],
  "patterns": ["pattern observed in the data", "another trend noticed", "third pattern identified"]
}`;

    // Call OpenAI with cost-effective model
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Most cost-effective model
      messages: [
        {
          role: "system",
          content: "You are an expert education administrator and data analyst. Provide actionable insights for school complaint management."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 800, // Limit tokens for cost control
      temperature: 0.3 // Lower temperature for more focused analysis
    });

    // Parse AI response
    let aiInsights;
    const rawResponse = completion.choices[0].message.content;
    console.log('Raw AI response:', rawResponse);
    
    try {
      // Try to parse the JSON directly
      aiInsights = JSON.parse(rawResponse);
      
      // Validate structure
      if (!aiInsights.insights || !aiInsights.recommendations || !aiInsights.patterns) {
        throw new Error('Invalid structure');
      }
      
    } catch (parseError) {
      console.log('JSON parsing failed:', parseError.message);
      
      // Try to extract JSON from response if it's wrapped in text
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          aiInsights = JSON.parse(jsonMatch[0]);
          console.log('Successfully extracted JSON from wrapped response');
        } catch (secondError) {
          console.log('Second parsing attempt failed:', secondError.message);
          aiInsights = createFallbackInsights(analysisData);
        }
      } else {
        console.log('No JSON found in response, using fallback');
        aiInsights = createFallbackInsights(analysisData);
      }
    }

    // Add metadata
    aiInsights.metadata = {
      complaintsAnalyzed: recentComplaints.length,
      analysisDate: new Date().toISOString(),
      tokensUsed: completion.usage?.total_tokens || 0,
      model: "gpt-4o-mini"
    };

    res.json(aiInsights);

  } catch (error) {
    console.error('AI insights error:', error);
    res.status(500).json({ 
      error: 'Failed to generate AI insights',
      fallback: {
        insights: ["AI analysis temporarily unavailable."],
        recommendations: ["Review complaint analytics dashboard for manual insights."],
        patterns: ["Manual pattern analysis recommended."]
      }
    });
  }
});

// AI-powered solution generator for individual complaints
app.post('/api/complaints/:id/ai-solution', aiRateLimiter, async (req, res) => {
  try {
    const complaintId = req.params.id;
    
    // Get complaint details
    const complaint = await new Promise((resolve, reject) => {
      const query = `
        SELECT c.*, p.name as parent_name, p.email as parent_email, p.phone as parent_phone,
               cat.name as category_name, s.name as assigned_staff_name
        FROM complaints c
        LEFT JOIN parents p ON c.parent_id = p.id
        LEFT JOIN categories cat ON c.category_id = cat.id
        LEFT JOIN staff s ON c.assigned_to = s.id
        WHERE c.id = ?
      `;
      
      db.get(query, [complaintId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    // Get complaint updates/history
    const updates = await new Promise((resolve, reject) => {
      const query = `
        SELECT cu.*, s.name as staff_name
        FROM complaint_updates cu
        LEFT JOIN staff s ON cu.staff_id = s.id
        WHERE cu.complaint_id = ?
        ORDER BY cu.created_at ASC
      `;
      
      db.all(query, [complaintId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    // Get historical solutions for similar complaints (AI learning component)
    const similarComplaints = await new Promise((resolve, reject) => {
      const query = `
        SELECT c.solution, c.process_taken, c.status, cat.name as category_name
        FROM complaints c
        LEFT JOIN categories cat ON c.category_id = cat.id
        WHERE c.category_id = ? AND c.solution IS NOT NULL AND c.solution != ''
        AND c.status IN ('resolved', 'closed')
        ORDER BY c.updated_at DESC
        LIMIT 5
      `;
      
      db.all(query, [complaint.category_id], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    // Prepare data for AI analysis
    const caseData = {
      category: complaint.category_name,
      priority: complaint.priority,
      status: complaint.status,
      title: complaint.title,
      description: complaint.description,
      studentGrade: complaint.grade_level,
      daysSinceCreated: Math.floor((Date.now() - new Date(complaint.created_at)) / (1000 * 60 * 60 * 24)),
      hasUpdates: updates.length > 0,
      updateCount: updates.length,
      lastUpdate: updates.length > 0 ? updates[updates.length - 1].message : null
    };

    // Create AI prompt for solution generation with historical learning
    const prompt = `You are an expert school administrator. Generate a comprehensive solution for this specific complaint case.

Current Case: ${JSON.stringify(caseData, null, 2)}

Historical Solutions for Similar Cases (learn from these successful approaches):
${similarComplaints.length > 0 ? JSON.stringify(similarComplaints, null, 2) : 'No similar resolved cases found.'}

Instructions:
- Analyze the current case details
- Learn from the historical solutions above to improve your recommendations
- Adapt successful patterns from similar cases to this specific situation
- Provide innovative solutions while building on proven approaches

IMPORTANT: Respond with ONLY a valid JSON object in this exact format (no other text):
{
  "solution": "A detailed, specific solution for this exact case, informed by historical success patterns",
  "actionSteps": ["Step 1: specific action", "Step 2: another action", "Step 3: follow-up action"],
  "preventionMeasures": ["Preventive measure 1", "Preventive measure 2", "Preventive measure 3"],
  "timeline": "Expected resolution timeframe",
  "stakeholders": ["Who should be involved in resolution"],
  "followUp": "Recommended follow-up actions"
}`;

    // Call OpenAI for solution generation
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert school administrator and conflict resolution specialist. Provide specific, actionable solutions for school complaints."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 1000,
      temperature: 0.4
    });

    // Parse AI response
    let aiSolution;
    const rawResponse = completion.choices[0].message.content;
    console.log('AI Solution Raw Response:', rawResponse);

    try {
      aiSolution = JSON.parse(rawResponse);
      
      // Validate structure
      if (!aiSolution.solution || !aiSolution.actionSteps) {
        throw new Error('Invalid solution structure');
      }
      
    } catch (parseError) {
      console.log('Solution parsing failed:', parseError.message);
      
      // Try to extract JSON
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          aiSolution = JSON.parse(jsonMatch[0]);
        } catch (secondError) {
          aiSolution = createFallbackSolution(caseData);
        }
      } else {
        aiSolution = createFallbackSolution(caseData);
      }
    }

    // Add metadata
    aiSolution.metadata = {
      complaintId: complaintId,
      generatedAt: new Date().toISOString(),
      tokensUsed: completion.usage?.total_tokens || 0,
      model: "gpt-4o-mini",
      historicalCasesAnalyzed: similarComplaints.length,
      learningEnabled: similarComplaints.length > 0
    };

    res.json(aiSolution);

  } catch (error) {
    console.error('AI solution generation error:', error);
    res.status(500).json({ 
      error: 'Failed to generate AI solution',
      fallback: createFallbackSolution({ category: 'General', priority: 'medium' })
    });
  }
});

// PDF Report Generation for individual complaints
app.get('/api/complaints/:id/pdf', async (req, res) => {
  try {
    const complaintId = req.params.id;
    
    // Get complaint details
    const complaint = await new Promise((resolve, reject) => {
      const query = `
        SELECT c.*, p.name as parent_name, p.email as parent_email, p.phone as parent_phone, p.address as parent_address,
               cat.name as category_name, cat.color as category_color, s.name as assigned_staff_name
        FROM complaints c
        LEFT JOIN parents p ON c.parent_id = p.id
        LEFT JOIN categories cat ON c.category_id = cat.id
        LEFT JOIN staff s ON c.assigned_to = s.id
        WHERE c.id = ?
      `;
      
      db.get(query, [complaintId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    // Get complaint updates
    const updates = await new Promise((resolve, reject) => {
      const query = `
        SELECT cu.*, s.name as staff_name
        FROM complaint_updates cu
        LEFT JOIN staff s ON cu.staff_id = s.id
        WHERE cu.complaint_id = ?
        ORDER BY cu.created_at ASC
      `;
      
      db.all(query, [complaintId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    // Get resolution steps
    const resolutionSteps = await new Promise((resolve, reject) => {
      const query = `
        SELECT rs.*, s.name as staff_name
        FROM resolution_steps rs
        LEFT JOIN staff s ON JSON_EXTRACT(rs.data, '$.staff_id') = s.id
        WHERE rs.complaint_id = ?
        ORDER BY rs.step_order ASC, rs.created_at ASC
      `;
      
      db.all(query, [complaintId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(row => ({
          ...row,
          data: row.data ? JSON.parse(row.data) : null
        })));
      });
    });

    // Get linked entities
    const linkedEntities = await new Promise((resolve, reject) => {
      const query = `
        SELECT * FROM linked_entities 
        WHERE complaint_id = ?
        ORDER BY entity_type, created_at
      `;
      
      db.all(query, [complaintId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(row => ({
          ...row,
          entity_data: row.entity_data ? JSON.parse(row.entity_data) : null
        })));
      });
    });

    // Create PDF
    const doc = new PDFDocument({ margin: 50 });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Complaint_${complaint.ticket_number}.pdf"`);
    
    // Pipe the PDF to response
    doc.pipe(res);

    // Add header
    doc.fontSize(20).font('Helvetica-Bold').text('COMPLAINT REPORT', 50, 50);
    doc.fontSize(12).font('Helvetica').text(`Generated: ${new Date().toLocaleString()}`, 50, 80);
    
    // Add ticket info
    doc.moveDown(2);
    doc.fontSize(16).font('Helvetica-Bold').text('TICKET INFORMATION', 50);
    doc.fontSize(12).font('Helvetica');
    doc.text(`Ticket Number: ${complaint.ticket_number}`, 50);
    doc.text(`Status: ${complaint.status.toUpperCase()}`, 50);
    doc.text(`Priority: ${complaint.priority.toUpperCase()}`, 50);
    doc.text(`Category: ${complaint.category_name}`, 50);
    doc.text(`Created: ${new Date(complaint.created_at).toLocaleString()}`, 50);
    doc.text(`Updated: ${new Date(complaint.updated_at).toLocaleString()}`, 50);
    if (complaint.assigned_staff_name) {
      doc.text(`Assigned To: ${complaint.assigned_staff_name}`, 50);
    }

    // Add parent information
    doc.moveDown(2);
    doc.fontSize(16).font('Helvetica-Bold').text('PARENT INFORMATION', 50);
    doc.fontSize(12).font('Helvetica');
    doc.text(`Name: ${complaint.parent_name}`, 50);
    if (complaint.parent_email) doc.text(`Email: ${complaint.parent_email}`, 50);
    if (complaint.parent_phone) doc.text(`Phone: ${complaint.parent_phone}`, 50);
    if (complaint.parent_address) doc.text(`Address: ${complaint.parent_address}`, 50);

    // Add student information
    doc.moveDown(2);
    doc.fontSize(16).font('Helvetica-Bold').text('STUDENT INFORMATION', 50);
    doc.fontSize(12).font('Helvetica');
    if (complaint.student_name) doc.text(`Name: ${complaint.student_name}`, 50);
    if (complaint.student_number) doc.text(`Student ID: ${complaint.student_number}`, 50);
    if (complaint.teacher_name) doc.text(`Teacher: ${complaint.teacher_name}`, 50);
    if (complaint.teacher_number) doc.text(`Teacher ID: ${complaint.teacher_number}`, 50);
    if (complaint.grade_level) doc.text(`Grade Level: ${complaint.grade_level}`, 50);

    // Add complaint details
    doc.moveDown(2);
    doc.fontSize(16).font('Helvetica-Bold').text('COMPLAINT DETAILS', 50);
    doc.fontSize(14).font('Helvetica-Bold').text(`Title: ${complaint.title}`, 50);
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica').text('Description:', 50);
    doc.text(complaint.description, 50, doc.y, { width: 500, align: 'left' });

    // Add process documentation if exists
    if (complaint.process_taken) {
      doc.moveDown(2);
      doc.fontSize(16).font('Helvetica-Bold').text('PROCESS TAKEN', 50);
      doc.fontSize(12).font('Helvetica').text(complaint.process_taken, 50, doc.y, { width: 500, align: 'left' });
      
      // Add AI indicator if this is AI-generated content
      if (complaint.process_taken.includes('AI-Generated Action Plan:')) {
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica').fillColor('#6B7280').text('🤖 This process was generated using AI assistance', 50);
        doc.fillColor('#000000'); // Reset color
      }
    }

    // Add solution if exists
    if (complaint.solution) {
      doc.moveDown(2);
      doc.fontSize(16).font('Helvetica-Bold').text('SOLUTION PROVIDED', 50);
      doc.fontSize(12).font('Helvetica').text(complaint.solution, 50, doc.y, { width: 500, align: 'left' });
      
      // Add AI indicator if this is AI-generated content
      if (complaint.solution.includes('AI-Recommended Solution:')) {
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica').fillColor('#6B7280').text('🤖 This solution was generated using AI assistance', 50);
        doc.fillColor('#000000'); // Reset color
      }
    }

    // Add resolution process section
    if (resolutionSteps.length > 0) {
      doc.moveDown(2);
      doc.fontSize(16).font('Helvetica-Bold').text('RESOLUTION PROCESS (AI-POWERED PIPELINE)', 50);
      
      resolutionSteps.forEach((step, index) => {
        doc.moveDown(1);
        doc.fontSize(14).font('Helvetica-Bold').text(`${step.step_order}. ${step.step_name}`, 50);
        
        // Status and AI indicator
        let statusLine = `Status: ${step.status.toUpperCase()}`;
        if (step.ai_generated) statusLine += ' (🤖 AI Generated)';
        doc.fontSize(10).font('Helvetica').text(statusLine, 50);
        
        if (step.data?.description) {
          doc.fontSize(11).text(`Description: ${step.data.description}`, 50);
        }
        
        if (step.data?.estimatedDays) {
          doc.text(`Estimated Duration: ${step.data.estimatedDays} days`, 50);
        }
        
        if (step.completed_at) {
          doc.text(`Completed: ${new Date(step.completed_at).toLocaleString()}`, 50);
        } else {
          doc.text(`Created: ${new Date(step.created_at).toLocaleString()}`, 50);
        }
        
        // AI insights for the first step (classification)
        if (step.data?.classification) {
          doc.moveDown(0.5);
          doc.fontSize(12).font('Helvetica-Bold').text('🤖 AI Classification:', 50);
          doc.fontSize(11).font('Helvetica');
          doc.text(`• Summary: ${step.data.classification.summary}`, 60);
          doc.text(`• Urgency: ${step.data.classification.urgency}`, 60);
          doc.text(`• Risk Assessment: ${step.data.riskAssessment}`, 60);
        }
        
        // AI recommendations
        if (step.data?.recommendations) {
          doc.moveDown(0.5);
          doc.fontSize(12).font('Helvetica-Bold').text('💡 AI Recommendations:', 50);
          doc.fontSize(11).font('Helvetica');
          step.data.recommendations.forEach(rec => {
            doc.text(`• ${rec}`, 60);
          });
        }
        
        // Stakeholders
        if (step.data?.stakeholders) {
          doc.moveDown(0.5);
          doc.fontSize(12).font('Helvetica-Bold').text('👥 Stakeholders:', 50);
          doc.fontSize(11).font('Helvetica').text(step.data.stakeholders.join(', '), 60);
        }
      });
      
      // Process summary
      const completedSteps = resolutionSteps.filter(s => s.status === 'completed').length;
      const totalSteps = resolutionSteps.length;
      const progressPercentage = Math.round((completedSteps / totalSteps) * 100);
      
      doc.moveDown(1);
      doc.fontSize(12).font('Helvetica-Bold').text('📊 Process Summary:', 50);
      doc.fontSize(11).font('Helvetica');
      doc.text(`Progress: ${completedSteps}/${totalSteps} steps completed (${progressPercentage}%)`, 60);
      doc.text(`AI-Generated Steps: ${resolutionSteps.filter(s => s.ai_generated).length}`, 60);
    }

    // Add linked entities section
    if (linkedEntities.length > 0) {
      doc.moveDown(2);
      doc.fontSize(16).font('Helvetica-Bold').text('LINKED ENTITIES', 50);
      
      linkedEntities.forEach((entity, index) => {
        doc.moveDown(1);
        doc.fontSize(12).font('Helvetica-Bold').text(`${entity.entity_type.toUpperCase()} ${index + 1}:`, 50);
        doc.fontSize(11).font('Helvetica');
        
        if (entity.entity_data) {
          Object.entries(entity.entity_data).forEach(([key, value]) => {
            if (value) {
              doc.text(`${key.replace('_', ' ').toUpperCase()}: ${value}`, 60);
            }
          });
        }
        
        if (entity.notion_id) {
          doc.text(`Notion ID: ${entity.notion_id}`, 60);
        }
      });
    }

    // Add updates/comments history
    if (updates.length > 0) {
      doc.moveDown(2);
      doc.fontSize(16).font('Helvetica-Bold').text('UPDATE HISTORY', 50);
      
      updates.forEach((update, index) => {
        doc.moveDown(1);
        doc.fontSize(12).font('Helvetica-Bold').text(`Update ${index + 1}:`, 50);
        doc.fontSize(10).font('Helvetica').text(`Date: ${new Date(update.created_at).toLocaleString()}`, 50);
        if (update.staff_name) doc.text(`Staff: ${update.staff_name}`, 50);
        doc.text(`Type: ${update.update_type}`, 50);
        doc.fontSize(12).text(`Message: ${update.message}`, 50, doc.y, { width: 500, align: 'left' });
      });
    }

    // Add footer
    doc.moveDown(3);
    doc.fontSize(10).font('Helvetica').text('--- End of Report ---', 50, doc.y, { width: 500, align: 'center' });
    doc.text(`Report generated by Parents Complaint Platform on ${new Date().toLocaleString()}`, 50, doc.y, { width: 500, align: 'center' });

    // Finalize the PDF
    doc.end();

  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({ error: 'Failed to generate PDF report' });
  }
});

// Get analytics data
app.get('/api/analytics', (req, res) => {
  const { start_date, end_date } = req.query;
  
  let dateFilter = '';
  const params = [];
  
  if (start_date) {
    dateFilter += ' AND c.created_at >= ?';
    params.push(start_date);
  }
  
  if (end_date) {
    dateFilter += ' AND c.created_at <= ?';
    params.push(end_date);
  }
  
  const queries = {
    // Total complaints
    totalComplaints: `SELECT COUNT(*) as count FROM complaints c WHERE 1=1${dateFilter}`,
    
    // Complaints by status
    complaintsByStatus: `
      SELECT status, COUNT(*) as count 
      FROM complaints c 
      WHERE 1=1${dateFilter}
      GROUP BY status
    `,
    
    // Complaints by category
    complaintsByCategory: `
      SELECT cat.name, cat.color, COUNT(*) as count
      FROM complaints c
      JOIN categories cat ON c.category_id = cat.id
      WHERE 1=1${dateFilter}
      GROUP BY cat.id, cat.name, cat.color
      ORDER BY count DESC
    `,
    
    // Complaints by priority
    complaintsByPriority: `
      SELECT priority, COUNT(*) as count
      FROM complaints c
      WHERE 1=1${dateFilter}
      GROUP BY priority
    `,
    
    // Average resolution time
    avgResolutionTime: `
      SELECT AVG(JULIANDAY(resolved_at) - JULIANDAY(created_at)) as avg_days
      FROM complaints c
      WHERE resolved_at IS NOT NULL${dateFilter}
    `,
    
    // Monthly trends
    monthlyTrends: `
      SELECT strftime('%Y-%m', c.created_at) as month, COUNT(*) as count
      FROM complaints c
      WHERE 1=1${dateFilter}
      GROUP BY strftime('%Y-%m', c.created_at)
      ORDER BY month DESC
      LIMIT 12
    `,
    
    // Top students with complaints
    topStudents: `
      SELECT student_name, COUNT(*) as count
      FROM complaints c
      WHERE student_name IS NOT NULL AND student_name != ''${dateFilter}
      GROUP BY student_name
      ORDER BY count DESC
      LIMIT 10
    `,
    
    // Top teachers with complaints
    topTeachers: `
      SELECT teacher_name, COUNT(*) as count
      FROM complaints c
      WHERE teacher_name IS NOT NULL AND teacher_name != ''${dateFilter}
      GROUP BY teacher_name
      ORDER BY count DESC
      LIMIT 10
    `,
    
    // Grade level distribution
    gradeLevelDistribution: `
      SELECT grade_level, COUNT(*) as count
      FROM complaints c
      WHERE grade_level IS NOT NULL AND grade_level != ''${dateFilter}
      GROUP BY grade_level
      ORDER BY count DESC
    `
  };
  
  const results = {};
  let completed = 0;
  const total = Object.keys(queries).length;
  
  Object.entries(queries).forEach(([key, query]) => {
    db.all(query, params, (err, rows) => {
      if (err) {
        console.error(`Error in ${key}:`, err);
        results[key] = [];
      } else {
        results[key] = key === 'totalComplaints' || key === 'avgResolutionTime' ? rows[0] : rows;
      }
      
      completed++;
      if (completed === total) {
        res.json(results);
      }
    });
  });
});

// Get categories
app.get('/api/categories', (req, res) => {
  db.all('SELECT * FROM categories ORDER BY name', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Get staff
app.get('/api/staff', (req, res) => {
  db.all('SELECT * FROM staff ORDER BY name', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Get teachers from Notion
app.get('/api/teachers', async (req, res) => {
  try {
    let allTeachers = [];
    let hasMore = true;
    let startCursor = undefined;

    // Fetch all pages of results
    while (hasMore) {
      const response = await notion.databases.query({
        database_id: process.env.TEACHERS_DATABASE_ID,
        sorts: [
          {
            property: 'Full Name',
            direction: 'ascending',
          },
        ],
        page_size: 100,
        start_cursor: startCursor,
      });

      const teachers = response.results.map(page => {
        const teacherId = page.properties['Teacher ID']?.unique_id
          ? `${page.properties['Teacher ID'].unique_id.prefix}-${page.properties['Teacher ID'].unique_id.number}`
          : '';
        const nickname = page.properties['Nickname']?.rich_text?.[0]?.plain_text || '';
        const fullName = page.properties['Full Name']?.title?.[0]?.plain_text || '';
        return {
          id: teacherId,
          name: nickname || fullName,
        };
      }).filter(teacher => teacher.id && teacher.name);

      allTeachers = allTeachers.concat(teachers);
      
      hasMore = response.has_more;
      startCursor = response.next_cursor;
    }

    console.log(`Fetched ${allTeachers.length} teachers from Notion database`);
    res.json(allTeachers);
  } catch (error) {
    console.error('Error fetching teachers from Notion:', error);
    res.status(500).json({ error: 'Failed to fetch teachers from Notion' });
  }
});

// Get students from Notion
app.get('/api/students', async (req, res) => {
  try {
    let allStudents = [];
    let hasMore = true;
    let startCursor = undefined;

    // Fetch all pages of results
    while (hasMore) {
      const response = await notion.databases.query({
        database_id: process.env.STUDENTS_DATABASE_ID,
        sorts: [
          {
            property: 'Full Name',
            direction: 'ascending',
          },
        ],
        page_size: 100, // Maximum page size
        start_cursor: startCursor,
      });

      const students = response.results.map(page => {
        // Handle unique_id type for Student ID
        const studentId = page.properties['Student ID']?.unique_id 
          ? `${page.properties['Student ID'].unique_id.prefix}-${page.properties['Student ID'].unique_id.number}`
          : '';
        
        const name = page.properties['Full Name']?.title?.[0]?.plain_text || '';
        
        return {
          id: studentId,
          name: name
        };
      }).filter(student => student.id && student.name); // Filter out empty entries

      allStudents = allStudents.concat(students);
      
      hasMore = response.has_more;
      startCursor = response.next_cursor;
    }

    console.log(`Fetched ${allStudents.length} students from Notion database`);
    res.json(allStudents);
  } catch (error) {
    console.error('Error fetching students from Notion:', error);
    res.status(500).json({ error: 'Failed to fetch students from Notion' });
  }
});

// Add new staff member
app.post('/api/staff', [
  body('name').notEmpty().withMessage('Staff name is required'),
  body('role').notEmpty().withMessage('Role is required')
], handleValidationErrors, (req, res) => {
  const { name, role } = req.body;
  
  const query = 'INSERT INTO staff (name, role) VALUES (?, ?)';
  db.run(query, [name, role], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    res.status(201).json({
      id: this.lastID,
      message: 'Staff member added successfully'
    });
  });
});

// Delete staff member
app.delete('/api/staff/:id', (req, res) => {
  const staffId = req.params.id;
  
  // First check if staff member is assigned to any complaints
  const checkQuery = 'SELECT COUNT(*) as count FROM complaints WHERE assigned_to = ?';
  db.get(checkQuery, [staffId], (err, result) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (result.count > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete staff member who is assigned to complaints. Please reassign complaints first.' 
      });
    }
    
    // If not assigned to any complaints, proceed with deletion
    const deleteQuery = 'DELETE FROM staff WHERE id = ?';
    db.run(deleteQuery, [staffId], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Staff member not found' });
      }
      
      res.json({ message: 'Staff member deleted successfully' });
    });
  });
});

// Delete complaint/ticket (cascading: updates, resolution_steps, linked_entities)
app.delete('/api/complaints/:id', async (req, res) => {
  const complaintId = req.params.id;

  const runQuery = (query, params) => new Promise((resolve, reject) => {
    db.run(query, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });

  try {
    await runQuery('DELETE FROM complaint_updates WHERE complaint_id = ?', [complaintId]);
    await runQuery('DELETE FROM resolution_steps WHERE complaint_id = ?', [complaintId]);
    await runQuery('DELETE FROM linked_entities WHERE complaint_id = ?', [complaintId]);

    const result = await runQuery('DELETE FROM complaints WHERE id = ?', [complaintId]);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    res.json({ message: 'Complaint deleted successfully' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// AI-powered resolution steps generator - creates resolution workflow based on complexity
app.post('/api/complaints/:id/generate-resolution', aiRateLimiter, async (req, res) => {
  try {
    const complaintId = req.params.id;
    
    // Get complaint details including complexity
    const complaint = await new Promise((resolve, reject) => {
      const query = `
        SELECT c.*, p.name as parent_name, p.email as parent_email,
               cat.name as category_name, s.name as assigned_staff_name
        FROM complaints c
        LEFT JOIN parents p ON c.parent_id = p.id
        LEFT JOIN categories cat ON c.category_id = cat.id
        LEFT JOIN staff s ON c.assigned_to = s.id
        WHERE c.id = ?
      `;
      
      db.get(query, [complaintId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    // Check if resolution steps already exist
    const existingSteps = await new Promise((resolve, reject) => {
      const query = `SELECT COUNT(*) as count FROM resolution_steps WHERE complaint_id = ?`;
      db.get(query, [complaintId], (err, row) => {
        if (err) reject(err);
        else resolve(row.count > 0);
      });
    });

    if (existingSteps) {
      return res.status(400).json({ error: 'Resolution steps already exist for this complaint' });
    }

    // Generate AI resolution steps
    const aiResponse = await generateResolutionSteps(complaint);
    console.log('Generated AI Resolution:', JSON.stringify(aiResponse, null, 2));

    // Insert resolution steps into database
    const insertPromises = aiResponse.resolutionSteps.map((step, index) => {
      return new Promise((resolve, reject) => {
        const stepData = {
          ...step,
          classification: aiResponse.classification,
          recommendations: aiResponse.recommendations,
          riskAssessment: aiResponse.riskAssessment,
          similarCases: aiResponse.similarCases
        };

        const query = `
          INSERT INTO resolution_steps (complaint_id, step_name, step_order, status, data, ai_generated)
          VALUES (?, ?, ?, 'pending', ?, 1)
        `;
        
        db.run(query, [
          complaintId,
          step.stepName,
          step.stepOrder,
          JSON.stringify(stepData)
        ], function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        });
      });
    });

    // Insert linked entities if available
    const linkPromises = [];
    
    // Link student if provided
    if (complaint.student_name && complaint.student_number) {
      linkPromises.push(new Promise((resolve, reject) => {
        const query = `
          INSERT INTO linked_entities (complaint_id, entity_type, entity_data)
          VALUES (?, 'student', ?)
        `;
        const studentData = {
          name: complaint.student_name,
          student_number: complaint.student_number,
          grade_level: complaint.grade_level
        };
        
        db.run(query, [complaintId, JSON.stringify(studentData)], function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        });
      }));
    }

    // Link teacher if provided
    if (complaint.teacher_name && complaint.teacher_number) {
      linkPromises.push(new Promise((resolve, reject) => {
        const query = `
          INSERT INTO linked_entities (complaint_id, entity_type, entity_data)
          VALUES (?, 'teacher', ?)
        `;
        const teacherData = {
          name: complaint.teacher_name,
          teacher_number: complaint.teacher_number
        };
        
        db.run(query, [complaintId, JSON.stringify(teacherData)], function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        });
      }));
    }

    // Wait for all inserts to complete
    await Promise.all([...insertPromises, ...linkPromises]);

    res.json({
      message: 'Resolution workflow generated successfully',
      complexity: complaint.complexity || 'complex',
      stepsGenerated: aiResponse.resolutionSteps.length,
      classification: aiResponse.classification
    });

  } catch (error) {
    console.error('Error generating resolution workflow:', error);
    res.status(500).json({ 
      error: 'Failed to generate resolution workflow',
      details: error.message 
    });
  }
});

// Convert AI solution to resolution steps checklist
app.post('/api/complaints/:id/generate-resolution-from-solution', aiRateLimiter, async (req, res) => {
  try {
    const complaintId = req.params.id;
    const { aiSolution } = req.body;
    
    console.log('Converting AI Solution to Resolution Steps for complaint:', complaintId);
    console.log('Received AI Solution:', JSON.stringify(aiSolution, null, 2));
    
    // Get complaint details including complexity
    const complaint = await new Promise((resolve, reject) => {
      const query = `
        SELECT c.*, p.name as parent_name, p.email as parent_email,
               cat.name as category_name, s.name as assigned_staff_name
        FROM complaints c
        LEFT JOIN parents p ON c.parent_id = p.id
        LEFT JOIN categories cat ON c.category_id = cat.id
        LEFT JOIN staff s ON c.assigned_to = s.id
        WHERE c.id = ?
      `;
      
      db.get(query, [complaintId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    // Check if resolution steps already exist
    const existingSteps = await new Promise((resolve, reject) => {
      const query = `SELECT COUNT(*) as count FROM resolution_steps WHERE complaint_id = ?`;
      db.get(query, [complaintId], (err, row) => {
        if (err) reject(err);
        else resolve(row.count > 0);
      });
    });

    if (existingSteps) {
      // If force regeneration is requested, clear existing steps
      if (req.body.forceRegenerate) {
        await new Promise((resolve, reject) => {
          const query = `DELETE FROM resolution_steps WHERE complaint_id = ?`;
          db.run(query, [complaintId], (err) => {
            if (err) reject(err);
            else resolve(true);
          });
        });
      } else {
        return res.status(400).json({ 
          error: 'Resolution steps already exist for this complaint',
          code: 'STEPS_EXIST'
        });
      }
    }

    // Create resolution steps from AI solution
    const isSimple = complaint.complexity === 'simple';
    console.log('Complaint complexity:', complaint.complexity, 'isSimple:', isSimple);
    const steps = [];

    if (isSimple) {
      // Simple workflow: 2 steps
      steps.push({
        stepName: "Review Request",
        stepOrder: 1,
        description: `Review the AI-recommended solution: ${aiSolution.solution}`,
        estimatedDays: 1,
        aiGenerated: true,
        actionSteps: aiSolution.actionSteps,
        recommendations: [`Implement: ${aiSolution.solution}`]
      });
      
      steps.push({
        stepName: "Provide Response",
        stepOrder: 2,
        description: "Communicate resolution to parent and implement follow-up",
        estimatedDays: 1,
        aiGenerated: true,
        actionSteps: [aiSolution.followUp || "Schedule follow-up communication"],
        recommendations: aiSolution.preventionMeasures
      });
    } else {
      // Complex workflow: 4 steps
      steps.push({
        stepName: "Intake",
        stepOrder: 1,
        description: "Initial complaint receipt and documentation with AI analysis",
        estimatedDays: 1,
        aiGenerated: true,
        actionSteps: ["Document complaint details", "Review AI solution recommendations"],
        recommendations: [`AI Solution: ${aiSolution.solution}`]
      });
      
      steps.push({
        stepName: "Investigation",
        stepOrder: 2,
        description: "Gather facts and interview relevant parties based on AI recommendations",
        estimatedDays: 2,
        aiGenerated: true,
        actionSteps: aiSolution.actionSteps?.slice(0, 3) || ["Investigate circumstances", "Interview stakeholders"],
        recommendations: [`Timeline: ${aiSolution.timeline}`, `Stakeholders: ${aiSolution.stakeholders?.join(', ')}`]
      });
      
      steps.push({
        stepName: "Resolution",
        stepOrder: 3,
        description: "Implement AI-recommended solution and communicate with stakeholders",
        estimatedDays: 2,
        aiGenerated: true,
        actionSteps: aiSolution.actionSteps?.slice(3) || [aiSolution.solution],
        recommendations: [`Solution: ${aiSolution.solution}`]
      });
      
      steps.push({
        stepName: "Follow-up",
        stepOrder: 4,
        description: "Monitor resolution effectiveness and implement preventive measures",
        estimatedDays: 1,
        aiGenerated: true,
        actionSteps: [aiSolution.followUp || "Schedule follow-up meeting"],
        recommendations: aiSolution.preventionMeasures || ["Monitor for recurrence"]
      });
    }

    console.log('Created steps:', JSON.stringify(steps, null, 2));

    // Insert resolution steps into database
    const insertPromises = steps.map((step) => {
      return new Promise((resolve, reject) => {
        const stepData = {
          description: step.description,
          estimatedDays: step.estimatedDays,
          classification: {
            category: complaint.category_name,
            priority: complaint.priority,
            urgency: "routine",
            summary: `AI-powered resolution for ${complaint.category_name} complaint`
          },
          recommendations: step.recommendations || [],
          actionSteps: step.actionSteps || [],
          riskAssessment: "low",
          similarCases: "Based on AI solution analysis"
        };

        const query = `
          INSERT INTO resolution_steps (complaint_id, step_name, step_order, status, data, ai_generated)
          VALUES (?, ?, ?, 'pending', ?, 1)
        `;
        
        db.run(query, [
          complaintId,
          step.stepName,
          step.stepOrder,
          JSON.stringify(stepData)
        ], function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        });
      });
    });

    // Wait for all inserts to complete
    await Promise.all(insertPromises);

    res.json({
      message: 'Resolution checklist created from AI solution',
      complexity: complaint.complexity || 'complex',
      stepsGenerated: steps.length,
      workflowType: isSimple ? 'simple' : 'complex'
    });

  } catch (error) {
    console.error('Error creating resolution checklist:', error);
    res.status(500).json({ 
      error: 'Failed to create resolution checklist',
      details: error.message 
    });
  }
});

// Serve React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build/index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;