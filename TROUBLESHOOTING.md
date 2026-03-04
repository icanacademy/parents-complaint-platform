# Troubleshooting Guide

## ✅ Quick Start (Recommended)

The easiest way to start the application:

```bash
cd "Parents Complaint Platform"
./start.sh
```

Then open your browser to: **http://localhost:5001**

## 🔧 Manual Setup

If the quick start doesn't work, follow these steps:

### 1. Install Dependencies
```bash
# Install server dependencies
npm install

# Install client dependencies  
cd client
npm install
cd ..
```

### 2. Build the Client
```bash
cd client
npm run build
cd ..
```

### 3. Start the Server
```bash
node server/index.js
```

### 4. Access the Application
- **Main Application**: http://localhost:5001
- **API Endpoints**: http://localhost:5001/api

## 🐛 Common Issues & Solutions

### Issue: "Port already in use"
**Solution**: Change the port number
```bash
# Edit server/index.js and change:
const PORT = process.env.PORT || 5002;  // Use different port
```

### Issue: "Cannot GET /"
**Solution**: Make sure the client is built
```bash
cd client
npm run build
cd ..
```

### Issue: "Database errors"
**Solution**: Reset the database
```bash
rm server/complaints.db  # Delete existing database
node server/index.js     # Restart server to recreate
```

### Issue: "Module not found"
**Solution**: Reinstall dependencies
```bash
rm -rf node_modules
rm -rf client/node_modules
npm install
cd client && npm install && cd ..
```

### Issue: "React development server not working"
**Solution**: Use production build instead
```bash
cd client
npm run build
cd ..
./start.sh
```

## 🧪 Testing the Application

### Test Backend API
```bash
# Test if server is running
curl http://localhost:5001/api/categories

# Expected: JSON response with categories
```

### Test Frontend
```bash
# Test if main page loads
curl http://localhost:5001

# Expected: HTML page with React app
```

## 📱 Using the Application

### 1. Submit a Complaint
- Click "Submit Complaint" tab
- Fill out the form completely
- Note the ticket number for tracking

### 2. Manage Complaints (Admin)
- Click "Manage Complaints" tab
- View all submitted complaints
- Click "View" to edit/update complaints
- Add comments and track progress

### 3. View Analytics
- Click "Analytics" tab
- Review charts and metrics
- Filter by date ranges
- Export data as needed

## 🔍 Debugging Tips

### Check Server Logs
```bash
# Server will show logs in terminal:
# - API requests
# - Database operations
# - Error messages
```

### Check Browser Console
```bash
# Open browser developer tools (F12)
# Look for JavaScript errors in Console tab
# Check Network tab for failed API calls
```

### Verify Database
```bash
# Database file location: server/complaints.db
# Use SQLite browser to inspect data
```

## 🆘 Still Having Issues?

1. **Restart Everything**:
   ```bash
   pkill -f "node.*server"  # Kill any existing servers
   ./start.sh               # Fresh start
   ```

2. **Clean Installation**:
   ```bash
   rm -rf node_modules client/node_modules
   rm server/complaints.db
   npm install
   cd client && npm install && cd ..
   ./start.sh
   ```

3. **Check System Requirements**:
   - Node.js v14 or higher
   - npm v6 or higher
   - Modern web browser with JavaScript enabled

## 📞 Success Indicators

✅ **Server Started**: "Server running on port 5001"
✅ **API Working**: Categories load at /api/categories  
✅ **Frontend Working**: React app loads at main URL
✅ **Database Working**: Can submit and view complaints
✅ **Analytics Working**: Charts and metrics display properly
✅ **Ticket Closing**: "Close Ticket" button appears in complaint management

## 🎯 Recent Fixes Applied

### ✅ Ticket Closing Functionality
- Added "Close Ticket" button in complaint management
- Available in both edit mode and read-only view
- Automatically updates complaint status to "closed"
- Shows "✅ Ticket Closed" confirmation when completed

### ✅ Analytics Dashboard Fixes
- Enhanced error handling for missing data
- Added safety checks for all chart components
- Improved data loading with better fallbacks
- Fixed TypeScript compatibility issues
- Added "No data available" messages for empty datasets

If all indicators are green, your application is working correctly!