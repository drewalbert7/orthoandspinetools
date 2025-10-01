#!/bin/bash

# SSL Certificate Renewal Script for OrthoAndSpineTools
# This script renews Let's Encrypt SSL certificates

set -e

echo "🔄 Renewing SSL certificates for OrthoAndSpineTools..."

# Renew certificates
echo "🔒 Renewing SSL certificate from Let's Encrypt..."
docker-compose -f docker-compose.ssl.yml run --rm certbot renew

# Reload nginx to use new certificates
echo "🔄 Reloading nginx with new certificates..."
docker-compose -f docker-compose.ssl.yml exec nginx nginx -s reload

echo "✅ SSL certificate renewal complete!"

# Test the renewed certificate
echo "🧪 Testing renewed SSL certificate..."
curl -I https://orthoandspinetools.com

echo "🎉 SSL certificate successfully renewed!"

