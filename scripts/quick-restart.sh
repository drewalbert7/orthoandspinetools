#!/bin/bash

# Safe Quick Restart Script for OrthoAndSpineTools
# This script restarts services WITHOUT recreating containers or volumes

set -e

echo "🔄 Restarting OrthoAndSpineTools services safely..."

# Restart services in order
echo "📊 Restarting PostgreSQL..."
docker restart orthoandspinetools-postgres

echo "⏳ Waiting for PostgreSQL to be ready..."
sleep 5

echo "🔧 Restarting Backend..."
docker restart orthoandspinetools-backend

echo "⏳ Waiting for Backend to be ready..."
sleep 5

echo "🎨 Restarting Frontend..."
docker restart orthoandspinetools-frontend

echo "⏳ Waiting for services to stabilize..."
sleep 5

# Check service health
echo "✅ Checking service health..."
docker ps --filter "name=orthoandspinetools" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "🎉 Services restarted successfully!"
echo ""
echo "Next steps:"
echo "1. Check logs: docker logs orthoandspinetools-backend --tail 20"
echo "2. Test login: curl -k -X POST https://orthoandspinetools.com/api/auth/login -H 'Content-Type: application/json' -d '{\"email\":\"user@example.com\",\"password\":\"pass\"}'"
echo "3. Visit site: https://orthoandspinetools.com"

