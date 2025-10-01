#!/bin/bash

# SSL Setup Script for OrthoAndSpineTools
# This script sets up Let's Encrypt SSL certificates

set -e

echo "🔐 Setting up SSL certificates for OrthoAndSpineTools..."

# Create necessary directories
echo "📁 Creating SSL directories..."
mkdir -p nginx/ssl/letsencrypt
mkdir -p nginx/ssl/certbot

# Start services without SSL first
echo "🚀 Starting services for initial setup..."
docker-compose up -d postgres backend frontend

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 30

# Run database migrations
echo "🗄️ Running database migrations..."
docker-compose exec backend npx prisma migrate deploy

# Start nginx with HTTP only for Let's Encrypt challenge
echo "🌐 Starting nginx for Let's Encrypt challenge..."
# Copy temporary nginx config
cp nginx/nginx-temp.conf nginx/nginx.conf
docker-compose up -d nginx

# Wait for nginx to start
sleep 10

# Obtain SSL certificate
echo "🔒 Obtaining SSL certificate from Let's Encrypt..."
docker run --rm -v $(pwd)/nginx/ssl/letsencrypt:/etc/letsencrypt -v $(pwd)/nginx/ssl/certbot:/var/www/certbot certbot/certbot certonly --webroot --webroot-path=/var/www/certbot --email admin@orthoandspinetools.com --agree-tos --no-eff-email -d orthoandspinetools.com -d www.orthoandspinetools.com

# Restart nginx with SSL configuration
echo "🔄 Restarting nginx with SSL configuration..."
cp nginx/nginx-ssl.conf nginx/nginx.conf
docker-compose restart nginx

# Test SSL certificate
echo "🧪 Testing SSL certificate..."
sleep 5
curl -I https://orthoandspinetools.com

echo "✅ SSL setup complete!"
echo "🔗 Your site is now available at: https://orthoandspinetools.com"
echo "📋 To set up automatic renewal, run: ./renew-ssl.sh"
