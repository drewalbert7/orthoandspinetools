#!/bin/bash

# SSL Certificate Backup Script for OrthoAndSpineTools
# This script creates a backup of SSL certificates and configuration

set -e

BACKUP_DIR="ssl-backup-$(date +%Y%m%d-%H%M%S)"
echo "📦 Creating SSL backup in $BACKUP_DIR..."

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup SSL certificates
echo "🔒 Backing up SSL certificates..."
# Copy accessible certificates only
cp -r nginx/ssl/certs "$BACKUP_DIR/" 2>/dev/null || echo "Warning: Could not backup certs directory"
# Use docker to copy Let's Encrypt certificates
docker run --rm -v $(pwd)/nginx/ssl/letsencrypt:/etc/letsencrypt -v $(pwd)/$BACKUP_DIR:/backup alpine:latest sh -c "cp -r /etc/letsencrypt /backup/letsencrypt" 2>/dev/null || echo "Warning: Could not backup Let's Encrypt certificates"

# Backup nginx configuration
echo "⚙️ Backing up nginx configuration..."
cp nginx/nginx.conf "$BACKUP_DIR/"
cp nginx/nginx-ssl.conf "$BACKUP_DIR/"
cp nginx/nginx-temp.conf "$BACKUP_DIR/"

# Backup docker-compose configuration
echo "🐳 Backing up docker-compose configuration..."
cp docker-compose.yml "$BACKUP_DIR/"

# Backup SSL management scripts
echo "📜 Backing up SSL management scripts..."
cp setup-ssl.sh "$BACKUP_DIR/"
cp update-ssl-certs.sh "$BACKUP_DIR/"
cp renew-ssl.sh "$BACKUP_DIR/"

# Create backup info file
cat > "$BACKUP_DIR/backup-info.txt" << EOF
SSL Backup Information
=====================
Date: $(date)
Domain: orthoandspinetools.com
Certificate Expiry: $(docker run --rm -v $(pwd)/nginx/ssl/letsencrypt:/etc/letsencrypt certbot/certbot certificates 2>/dev/null | grep "Expiry Date" | head -1)
Backup Contents:
- Let's Encrypt certificates
- Nginx SSL configuration
- Docker Compose configuration
- SSL management scripts

To restore from this backup:
1. Stop services: docker-compose down
2. Copy files back to their locations
3. Start services: docker-compose up -d
4. Test SSL: curl -I https://orthoandspinetools.com
EOF

# Compress backup (ignore permission errors)
echo "🗜️ Compressing backup..."
tar -czf "${BACKUP_DIR}.tar.gz" "$BACKUP_DIR" 2>/dev/null || tar -czf "${BACKUP_DIR}.tar.gz" "$BACKUP_DIR" --ignore-failed-read
rm -rf "$BACKUP_DIR"

echo "✅ SSL backup complete: ${BACKUP_DIR}.tar.gz"
echo "📋 Backup info:"
cat "${BACKUP_DIR}.tar.gz.info" 2>/dev/null || echo "Backup created successfully"
