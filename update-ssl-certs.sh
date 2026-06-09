#!/bin/bash
# Renew Let's Encrypt certs and reload production nginx.

set -euo pipefail

cd "$(dirname "$0")"
COMPOSE="docker compose -f docker-compose.prod.yml"

mkdir -p nginx/ssl/certbot nginx/ssl/certs nginx/ssl/letsencrypt

echo "Renewing certificate (webroot)..."
docker run --rm \
  -v "$(pwd)/nginx/ssl/letsencrypt:/etc/letsencrypt" \
  -v "$(pwd)/nginx/ssl/certbot:/var/www/certbot" \
  certbot/certbot renew --webroot --webroot-path=/var/www/certbot \
  || docker run --rm \
    -v "$(pwd)/nginx/ssl/letsencrypt:/etc/letsencrypt" \
    -v "$(pwd)/nginx/ssl/certbot:/var/www/certbot" \
    certbot/certbot certonly --webroot --webroot-path=/var/www/certbot \
    --email admin@orthoandspinetools.com --agree-tos --no-eff-email \
    -d orthoandspinetools.com -d www.orthoandspinetools.com

echo "Copying certs into nginx/ssl/certs/..."
docker run --rm \
  -v "$(pwd)/nginx/ssl/letsencrypt:/etc/letsencrypt" \
  -v "$(pwd)/nginx/ssl/certs:/certs" \
  alpine sh -c "cp /etc/letsencrypt/live/orthoandspinetools.com/fullchain.pem /certs/ && cp /etc/letsencrypt/live/orthoandspinetools.com/privkey.pem /certs/ && chmod 644 /certs/fullchain.pem && chmod 600 /certs/privkey.pem"

echo "Reloading nginx..."
$COMPOSE up -d nginx
$COMPOSE exec nginx nginx -t
$COMPOSE exec nginx nginx -s reload

echo "Certificate dates:"
openssl x509 -in nginx/ssl/certs/fullchain.pem -noout -dates

echo "HTTPS check:"
if curl -sfI https://orthoandspinetools.com | head -5; then
    echo "HTTPS OK"
else
    echo "Warning: HTTPS check failed (certs may still be updated on disk — verify manually)"
fi

echo "Done."
