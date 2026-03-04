#!/bin/bash
cd "/Users/icanacademy/Parents Complaint Platform"

echo "Starting Parents Complaint Platform..."
echo ""

# Start Cloudflare tunnel if not already running
if ! pgrep -f "cloudflared tunnel run cosmodrive" > /dev/null 2>&1; then
    echo "🌐 Starting Cloudflare Tunnel..."
    cloudflared tunnel run cosmodrive &
    sleep 2
    echo "✅ Cloudflare Tunnel started"
else
    echo "🌐 Cloudflare Tunnel already running"
fi

echo ""
echo "  App:        http://localhost:5050"
echo "  Public URL: https://parentrequest.icanacademy.work"
echo "  API:        http://localhost:5050/api"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

node server/index.js
