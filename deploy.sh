#!/bin/bash

# OrthoAndSpineTools Production Deployment Script
# This script helps deploy the medical platform to production

set -e

echo "🏥 OrthoAndSpineTools Production Deployment"
echo "=========================================="

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   echo "❌ This script should not be run as root for security reasons"
   exit 1
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    echo "   Run: curl -fsSL https://get.docker.com -o get-docker.sh && sudo sh get-docker.sh"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Installing..."
    sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
fi

# Create environment file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating production environment file..."
    cat > .env << EOF
# Production Environment Variables
NODE_ENV=production
POSTGRES_PASSWORD=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -base64 64)
DOMAIN=orthoandspinetools.com
EMAIL=admin@orthoandspinetools.com
EOF
    echo "✅ Environment file created with secure random passwords"
fi

# Load environment variables
source .env

echo "🔧 Setting up SSL certificates..."
if [ ! -f nginx/ssl/cert.pem ] || [ ! -f nginx/ssl/key.pem ]; then
    echo "⚠️  SSL certificates not found. You need to:"
    echo "   1. Get SSL certificates from Let's Encrypt or your provider"
    echo "   2. Copy cert.pem and key.pem to nginx/ssl/"
    echo "   3. Or run: sudo certbot certonly --standalone -d orthoandspinetools.com"
    echo ""
    echo "For now, creating self-signed certificates for testing..."
    
    mkdir -p nginx/ssl
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout nginx/ssl/key.pem \
        -out nginx/ssl/cert.pem \
        -subj "/C=US/ST=State/L=City/O=OrthoAndSpineTools/CN=orthoandspinetools.com"
    
    echo "✅ Self-signed certificates created (replace with real certificates for production)"
fi

echo "🐳 Building and starting services..."
docker-compose -f docker-compose.prod.yml down --remove-orphans
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d

echo "⏳ Waiting for services to start..."
sleep 30

echo "🔍 Checking service health..."
if curl -f http://localhost/health > /dev/null 2>&1; then
    echo "✅ Nginx is running"
else
    echo "❌ Nginx is not responding"
fi

if curl -f http://localhost/api/auth/me > /dev/null 2>&1; then
    echo "✅ Backend API is running"
else
    echo "❌ Backend API is not responding"
fi

echo ""
echo "🎉 Deployment completed!"
echo ""
echo "📋 Next steps:"
echo "   1. Update DNS to point orthoandspinetools.com to this server"
echo "   2. Replace self-signed SSL certificates with real ones"
echo "   3. Run database migrations: docker-compose -f docker-compose.prod.yml exec backend npm run db:migrate"
echo "   4. Create admin user: docker-compose -f docker-compose.prod.yml exec backend npm run create-admin"
echo ""
echo "🔗 Services:"
echo "   - Website: https://orthoandspinetools.com"
echo "   - API: https://orthoandspinetools.com/api"
echo "   - Health: https://orthoandspinetools.com/health"
echo ""
echo "📊 Monitor logs:"
echo "   docker-compose -f docker-compose.prod.yml logs -f"
echo ""
echo "🛑 Stop services:"
echo "   docker-compose -f docker-compose.prod.yml down"
