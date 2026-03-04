#!/bin/bash

echo "🚀 Starting Parents Complaint Platform..."
echo ""

# Check if build exists
if [ ! -d "client/build" ]; then
    echo "📦 Building React client..."
    cd client
    npm run build
    cd ..
    echo "✅ Build complete!"
    echo ""
fi

# Start the server
echo "🖥️  Starting server on http://localhost:5050"
echo ""
echo "📊 Available endpoints:"
echo "   • Main App: http://localhost:5050"
echo "   • API: http://localhost:5050/api"
echo "   • Categories: http://localhost:5050/api/categories"
echo "   • Analytics: http://localhost:5050/api/analytics"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

node server/index.js