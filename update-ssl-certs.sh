#!/bin/bash

# SSL Certificate Update Script for OrthoAndSpineTools
# This script updates the SSL certificates and reloads nginx

set -e

echo "🔄 Updating SSL certificates..."

# Renew certificates
echo "🔒 Renewing SSL certificate from Let's Encrypt..."
docker run --rm -v $(pwd)/nginx/ssl/letsencrypt:/etc/letsencrypt -v $(pwd)/nginx/ssl/certbot:/var/www/certbot certbot/certbot renew

# Copy new certificates to accessible location
echo "📋 Copying certificates to accessible location..."
docker run --rm -v $(pwd)/nginx/ssl/letsencrypt:/etc/letsencrypt -v $(pwd)/nginx/ssl/certs:/certs alpine:latest sh -c "cp /etc/letsencrypt/live/orthoandspinetools.com/fullchain.pem /certs/ && cp /etc/letsencrypt/live/orthoandspinetools.com/privkey.pem /certs/"

# Reload nginx to use new certificates
echo "🔄 Reloading nginx with new certificates..."
docker-compose exec nginx nginx -s reload

echo "✅ SSL certificate update complete!"

# Test the updated certificate
echo "🧪 Testing updated SSL certificate..."
curl -I https://orthoandspinetools.com

echo "🎉 SSL certificate successfully updated!"
