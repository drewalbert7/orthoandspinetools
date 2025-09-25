# Deployment Guide

This guide provides comprehensive instructions for deploying OrthoAndSpineTools in various environments.

## 🚀 Quick Start Deployment

### Prerequisites
- Docker and Docker Compose
- Domain name (e.g., orthoandspinetools.com)
- SSL certificate
- PostgreSQL database
- Redis cache

### Basic Docker Deployment
```bash
# Clone repositories
git clone https://github.com/drewalbert7/lemmy.git orthoandspinetools-backend
git clone https://github.com/drewalbert7/lemmy-ui.git orthoandspinetools-frontend

# Configure environment
cd orthoandspinetools-backend
cp .env.example .env
# Edit .env with your configuration

# Start services
docker-compose up -d
```

## 🏗️ Production Deployment

### 1. Server Requirements

**Minimum Requirements:**
- **CPU**: 2 cores
- **RAM**: 4GB
- **Storage**: 50GB SSD
- **Network**: 100Mbps

**Recommended Requirements:**
- **CPU**: 4 cores
- **RAM**: 8GB
- **Storage**: 100GB SSD
- **Network**: 1Gbps

### 2. Environment Setup

**Backend Configuration (`.env`):**
```bash
# Database
DATABASE_URL=postgresql://lemmy:password@postgres:5432/lemmy
REDIS_URL=redis://redis:6379

# Site Configuration
LEMMY_HOSTNAME=orthoandspinetools.com
LEMMY_HTTPS=true
LEMMY_DOMAIN=orthoandspinetools.com

# Medical Features
MEDICAL_SPECIALTIES_ENABLED=true
MEDICAL_PROFESSIONAL_VERIFICATION=true
HIPAA_COMPLIANCE_MODE=true

# Security
JWT_SECRET=your-secret-key
PICTRS_API_KEY=your-pictrs-key
```

**Frontend Configuration:**
```bash
# Backend Connection
LEMMY_UI_BACKEND_EXTERNAL=https://orthoandspinetools.com
LEMMY_UI_BACKEND_INTERNAL=http://lemmy:8536

# Medical UI Features
LEMMY_UI_MEDICAL_COMMUNITIES=true
LEMMY_UI_PROFESSIONAL_DASHBOARD=true
LEMMY_UI_MEDICAL_THEMES=true
```

### 3. Database Setup

**PostgreSQL Configuration:**
```sql
-- Create database
CREATE DATABASE lemmy;

-- Create user
CREATE USER lemmy WITH PASSWORD 'secure_password';

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE lemmy TO lemmy;

-- Medical-specific extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
```

**Medical Data Schema:**
```sql
-- Medical specialties table
CREATE TABLE medical_specialties (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) UNIQUE NOT NULL,
    icon VARCHAR(50),
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Insert medical specialties
INSERT INTO medical_specialties (name, slug, icon) VALUES
('Foot & Ankle', 'foot-ankle', 'shoe-prints'),
('Spine', 'spine', 'bone'),
('Ortho Trauma', 'ortho-trauma', 'truck-medical'),
('Ortho Oncology', 'ortho-oncology', 'ribbon'),
('Peds Ortho', 'peds-ortho', 'baby'),
('Shoulder Elbow', 'shoulder-elbow', 'hand-paper'),
('Hand', 'hand', 'hand'),
('Sports', 'sports', 'running'),
('Adult Reconstruction', 'adult-reconstruction', 'tools');
```

### 4. Docker Compose Configuration

**docker-compose.yml:**
```yaml
version: "3.8"

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: lemmy
      POSTGRES_USER: lemmy
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: always

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: always

  lemmy:
    image: dessalines/lemmy:latest
    ports:
      - "8536:8536"
    environment:
      - DATABASE_URL=postgresql://lemmy:password@postgres:5432/lemmy
      - REDIS_URL=redis://redis:6379
      - LEMMY_HOSTNAME=orthoandspinetools.com
      - LEMMY_HTTPS=true
    volumes:
      - lemmy_data:/app/volumes
    depends_on:
      - postgres
      - redis
    restart: always

  lemmy-ui:
    image: dessalines/lemmy-ui:latest
    ports:
      - "1234:1234"
    environment:
      - LEMMY_UI_BACKEND_INTERNAL=http://lemmy:8536
      - LEMMY_UI_BACKEND_EXTERNAL=https://orthoandspinetools.com
      - LEMMY_UI_HTTPS=true
    depends_on:
      - lemmy
    restart: always

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - lemmy-ui
    restart: always

volumes:
  postgres_data:
  redis_data:
  lemmy_data:
```

### 5. Nginx Configuration

**nginx.conf:**
```nginx
events {
    worker_connections 1024;
}

http {
    upstream lemmy-ui {
        server lemmy-ui:1234;
    }

    upstream lemmy {
        server lemmy:8536;
    }

    server {
        listen 80;
        server_name orthoandspinetools.com;
        return 301 https://$server_name$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name orthoandspinetools.com;

        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;

        # Medical platform security headers
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self';" always;

        location / {
            proxy_pass http://lemmy-ui;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        location /api/ {
            proxy_pass http://lemmy;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
```

## 🔒 Security Configuration

### 1. SSL/TLS Setup
```bash
# Generate SSL certificate (Let's Encrypt)
certbot certonly --standalone -d orthoandspinetools.com

# Copy certificates
cp /etc/letsencrypt/live/orthoandspinetools.com/fullchain.pem ./ssl/cert.pem
cp /etc/letsencrypt/live/orthoandspinetools.com/privkey.pem ./ssl/key.pem
```

### 2. Firewall Configuration
```bash
# UFW firewall rules
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw enable
```

### 3. Medical Data Security
```bash
# Database encryption
ALTER DATABASE lemmy SET encryption_key = 'your-encryption-key';

# Audit logging
CREATE TABLE medical_audit_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    action VARCHAR(100),
    medical_data_type VARCHAR(50),
    timestamp TIMESTAMP DEFAULT NOW()
);
```

## 📊 Monitoring Setup

### 1. Health Checks
```bash
# Backend health check
curl -f http://localhost:8536/api/v3/site || exit 1

# Frontend health check
curl -f http://localhost:1234 || exit 1

# Database health check
pg_isready -h localhost -p 5432 || exit 1
```

### 2. Log Monitoring
```bash
# Docker logs
docker-compose logs -f lemmy
docker-compose logs -f lemmy-ui

# Medical-specific logs
tail -f /var/log/medical-audit.log
```

### 3. Performance Monitoring
```bash
# Resource monitoring
docker stats

# Database performance
pg_stat_activity
```

## 🔄 Backup Strategy

### 1. Database Backup
```bash
# Daily backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump -h localhost -U lemmy lemmy > backup_$DATE.sql
aws s3 cp backup_$DATE.sql s3://orthoandspinetools-backups/
```

### 2. Configuration Backup
```bash
# Backup configuration files
tar -czf config_backup_$(date +%Y%m%d).tar.gz \
    docker-compose.yml \
    nginx.conf \
    .env \
    ssl/
```

### 3. Medical Data Backup
```bash
# Medical-specific data backup
pg_dump -h localhost -U lemmy \
    -t medical_specialties \
    -t medical_professionals \
    -t medical_communities \
    lemmy > medical_data_backup_$(date +%Y%m%d).sql
```

## 🚀 Scaling Configuration

### 1. Horizontal Scaling
```yaml
# docker-compose.scale.yml
services:
  lemmy:
    deploy:
      replicas: 3
    environment:
      - LEMMY_DATABASE_POOL_SIZE=10

  lemmy-ui:
    deploy:
      replicas: 2
```

### 2. Load Balancing
```nginx
# Load balancer configuration
upstream lemmy_backend {
    server lemmy1:8536;
    server lemmy2:8536;
    server lemmy3:8536;
}

upstream lemmy_frontend {
    server lemmy-ui1:1234;
    server lemmy-ui2:1234;
}
```

### 3. Database Scaling
```bash
# Read replicas
CREATE SUBSCRIPTION lemmy_read_replica
FOR ALL TABLES
WITH (copy_data = true);
```

## 🔧 Maintenance

### 1. Regular Updates
```bash
# Update Docker images
docker-compose pull
docker-compose up -d

# Database migrations
docker-compose exec lemmy diesel migration run
```

### 2. Medical Content Moderation
```bash
# Medical content audit
psql -h localhost -U lemmy -d lemmy -c "
SELECT COUNT(*) FROM posts 
WHERE community_id IN (
    SELECT id FROM communities 
    WHERE name LIKE '%medical%'
);
"
```

### 3. Performance Optimization
```bash
# Database optimization
psql -h localhost -U lemmy -d lemmy -c "VACUUM ANALYZE;"

# Cache optimization
redis-cli FLUSHDB
```

## 📞 Support

### Deployment Issues
- **GitHub Issues**: Technical deployment problems
- **Documentation**: This deployment guide
- **Community Support**: Medical professional community

### Emergency Procedures
- **Service Restart**: `docker-compose restart`
- **Database Recovery**: Restore from latest backup
- **Security Incident**: Follow medical data breach protocols

---

This deployment guide ensures a secure, scalable, and HIPAA-compliant deployment of OrthoAndSpineTools for medical professionals.

