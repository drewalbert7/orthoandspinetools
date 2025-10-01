#!/bin/bash

# One-Command Deployment Script for OrthoAndSpineTools
# This script will deploy the medical platform to fix the 502 error

set -e

echo "🏥 OrthoAndSpineTools - One-Command Deployment"
echo "=============================================="
echo "Fixing 502 Bad Gateway on orthoandspinetools.com"
echo ""

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo "❌ This script must be run as root for full deployment"
   echo "   Run: sudo $0"
   exit 1
fi

# Update system
echo "📦 Updating system packages..."
apt update -y

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    echo "🐳 Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
fi

# Install Docker Compose if not present
if ! command -v docker-compose &> /dev/null; then
    echo "🐳 Installing Docker Compose..."
    curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
fi

# Install Git if not present
if ! command -v git &> /dev/null; then
    echo "📥 Installing Git..."
    apt install -y git
fi

# Clone or update repository
if [ -d "orthoandspinetools" ]; then
    echo "🔄 Updating existing repository..."
    cd orthoandspinetools
    git pull origin main
else
    echo "📥 Cloning repository..."
    git clone https://github.com/drewalbert7/orthoandspinetools.git
    cd orthoandspinetools
fi

# Create environment file
echo "⚙️  Creating production environment..."
cat > .env << EOF
NODE_ENV=production
POSTGRES_PASSWORD=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -base64 64)
DOMAIN=orthoandspinetools.com
EOF

# Create SSL directory
mkdir -p nginx/ssl

# Generate self-signed certificate (will be replaced with real one)
echo "🔒 Creating temporary SSL certificate..."
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout nginx/ssl/key.pem \
    -out nginx/ssl/cert.pem \
    -subj "/C=US/ST=State/L=City/O=OrthoAndSpineTools/CN=orthoandspinetools.com"

# Stop any existing services
echo "🛑 Stopping existing services..."
docker-compose -f docker-compose.prod.yml down --remove-orphans 2>/dev/null || true

# Build and start services
echo "🚀 Building and starting services..."
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d

# Wait for services to start
echo "⏳ Waiting for services to start..."
sleep 30

# Check if services are running
echo "🔍 Checking service health..."
if curl -f http://localhost/health > /dev/null 2>&1; then
    echo "✅ Application is running!"
else
    echo "❌ Application failed to start. Checking logs..."
    docker-compose -f docker-compose.prod.yml logs --tail=50
    exit 1
fi

# Install certbot for SSL
echo "🔒 Installing SSL certificate tools..."
apt install -y certbot

echo ""
echo "🎉 DEPLOYMENT COMPLETED!"
echo "========================"
echo ""
echo "✅ Application is now running on orthoandspinetools.com"
echo "✅ Backend API: https://orthoandspinetools.com/api"
echo "✅ Frontend: https://orthoandspinetools.com"
echo "✅ Health Check: https://orthoandspinetools.com/health"
echo ""
echo "🔒 Next Steps for SSL:"
echo "   1. Get real SSL certificate:"
echo "      certbot certonly --standalone -d orthoandspinetools.com"
echo ""
echo "   2. Copy real certificates:"
echo "      cp /etc/letsencrypt/live/orthoandspinetools.com/fullchain.pem nginx/ssl/cert.pem"
echo "      cp /etc/letsencrypt/live/orthoandspinetools.com/privkey.pem nginx/ssl/key.pem"
echo ""
echo "   3. Restart nginx:"
echo "      docker-compose -f docker-compose.prod.yml restart nginx"
echo ""
echo "📊 Monitor logs:"
echo "   docker-compose -f docker-compose.prod.yml logs -f"
echo ""
echo "🛑 Stop services:"
echo "   docker-compose -f docker-compose.prod.yml down"
echo ""
echo "The 502 error should now be fixed! 🎯"
