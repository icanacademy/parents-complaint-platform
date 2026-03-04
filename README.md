# ICAN Parent's Request Platform

A comprehensive web-based platform for managing parent requests with real-time analytics, ticket tracking, and administrative dashboard. Built with Node.js, Express, SQLite, and React.

## Features

### 🎯 Core Features
- **Request Submission Form**: Parents can submit detailed requests with categories and priority levels
- **Ticket System**: Automatic ticket number generation and tracking
- **Admin Dashboard**: Comprehensive management interface for ICAN staff
- **Analytics Dashboard**: Real-time insights with charts and visualizations
- **Search & Filter**: Advanced filtering by status, category, priority, and keywords
- **Status Tracking**: Complete request lifecycle management
- **Process Documentation**: Track actions taken and solutions provided

### 📊 Analytics & Reporting
- Total requests overview
- Requests by status, category, and priority
- Resolution time analysis
- Monthly trends visualization
- Key insights and metrics
- Interactive charts using Recharts

### 🏗️ Technical Features
- **Database**: SQLite with comprehensive schema
- **API**: RESTful endpoints with validation
- **Frontend**: React TypeScript with responsive design
- **Real-time Updates**: Live complaint tracking
- **Responsive Design**: Works on desktop and mobile devices

## Installation & Setup

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### 1. Clone/Navigate to the Project
```bash
cd "Parents Complaint Platform"
```

### 2. Install Dependencies
```bash
# Install server dependencies
npm install

# Install client dependencies
cd client
npm install
cd ..
```

### 3. Start the Application

#### Development Mode (Recommended)
```bash
# Run both server and client simultaneously
npm run dev
```

#### Production Mode
```bash
# Build the client
npm run build

# Start the server
npm start
```

The application will be available at:
- **Frontend**: http://localhost:3000 (development) or http://localhost:5000 (production)
- **Backend API**: http://localhost:5000/api

## Usage Guide

### For Parents (Request Submission)

1. **Navigate to "Submit Request" tab**
2. **Fill out parent information**:
   - Full name (required)
   - Email address (required)
   - Phone number (optional)
   - Address (optional)

3. **Enter request details**:
   - Request title (required)
   - Select category from dropdown
   - Choose priority level (Low/Medium/High)
   - Provide detailed description (required)

4. **Submit the request**
   - Receive confirmation with ticket number
   - Save ticket number for future reference

### For Staff (Management Dashboard)

1. **Navigate to "Manage Complaints" tab**
2. **View all complaints** in table format
3. **Use filters** to find specific complaints:
   - Search by text
   - Filter by status (Open/In Progress/Resolved/Closed)
   - Filter by category
   - Filter by priority

4. **Click "View" to manage individual complaints**:
   - Update complaint status
   - Assign to staff members
   - Document process taken
   - Record solution provided
   - Add comments/updates

### For Administrators (Analytics)

1. **Navigate to "Analytics" tab**
2. **View key metrics**:
   - Total complaints count
   - Average resolution time
   - Open vs resolved complaints

3. **Analyze data with charts**:
   - Complaints by status (bar chart)
   - Complaints by category (pie chart)
   - Priority distribution
   - Monthly trends (line chart)

4. **Filter by date range** for specific periods
5. **Review insights section** for key findings

## Database Schema

### Tables
- **parents**: Parent contact information
- **categories**: Complaint categories with colors
- **staff**: Staff members and assignments  
- **complaints**: Main complaint records with ticket tracking
- **complaint_updates**: Comments and status change history

### Default Categories
- Academic Issues
- Bullying/Safety
- Communication
- Facilities
- Transportation
- Food Services
- Special Needs
- Disciplinary Actions
- Extracurricular
- Other

## API Endpoints

### Complaints
- `GET /api/complaints` - List complaints with pagination/filtering
- `GET /api/complaints/:id` - Get complaint details with updates
- `POST /api/complaints` - Create new complaint
- `PUT /api/complaints/:id` - Update complaint
- `POST /api/complaints/:id/updates` - Add comment/update

### Data
- `GET /api/categories` - List all categories
- `GET /api/staff` - List all staff members
- `GET /api/analytics` - Get analytics data

## Configuration

### Environment Variables
Create a `.env` file in the root directory:
```
PORT=5000
NODE_ENV=development
```

### Database
The SQLite database (`complaints.db`) is automatically created in the `server` directory on first run.

## Customization

### Adding New Categories
Categories can be added directly to the database or by modifying the `defaultCategories` array in `server/database.js`.

### Adding Staff Members
Staff can be added by inserting records into the `staff` table or modifying the default staff in `server/database.js`.

### Styling
The application uses custom CSS. Modify `client/src/App.css` to customize the appearance.

## Troubleshooting

### Common Issues

1. **Port already in use**
   - Change the PORT in package.json or .env file
   - Kill existing processes using the port

2. **Database errors**
   - Delete `server/complaints.db` to reset the database
   - Ensure write permissions in the server directory

3. **Client not connecting to server**
   - Verify the proxy setting in `client/package.json`
   - Check that server is running on the correct port

### Development Tips
- Use browser developer tools to debug frontend issues
- Check server console for API errors
- Database can be inspected using SQLite browser tools

## License

This project is for educational and internal use. Please ensure compliance with your organization's policies before deployment.

## Support

For issues or feature requests, please document them in your organization's issue tracking system.