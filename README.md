# OrthoAndSpineTools Medical Platform

A Reddit-style community platform for orthopedic and spine professionals to share tools, hardware, X-rays, and discuss cases.

## 🏥 Medical Specialties Supported

- **Orthopedic Surgery** - General orthopedic procedures and tools
- **Spine Surgery** - Spinal procedures, implants, and techniques
- **Sports Medicine** - Athletic injury treatment and prevention
- **Trauma Surgery** - Emergency orthopedic procedures
- **Pediatric Orthopedics** - Children's orthopedic care
- **Hand Surgery** - Hand and upper extremity procedures
- **Foot & Ankle** - Lower extremity orthopedic care
- **Joint Replacement** - Hip, knee, and other joint procedures
- **Spine Deformity** - Scoliosis and spinal deformity correction

## 🛠️ Tech Stack

### Backend
- **Node.js** + **Express** + **TypeScript**
- **PostgreSQL** database with **Prisma** ORM
- **JWT** authentication with **bcrypt**
- **Multer** for image uploads
- **Winston** for logging
- **Express Rate Limit** for security

### Frontend
- **React** + **TypeScript** + **Vite**
- **Tailwind CSS** for styling
- **React Router** for navigation
- **React Query** for data fetching
- **React Hook Form** for forms
- **Axios** for API calls

This project consists of three main components:

### Backend (`backend/`)
- **Technology**: Node.js + TypeScript + Prisma ORM
- **Features**: Custom medical API with specialty-specific endpoints
- **Database**: PostgreSQL with medical-focused schema
- **Security**: HIPAA-compliant data handling

### Frontend (`frontend/`)
- **Technology**: React + Vite + TypeScript
- **Features**: Modern medical community interface
- **UI**: Custom medical specialty components and dashboards
- **Responsive**: Mobile-optimized for medical workflows

### Documentation (`docs/`)
- **Purpose**: Project documentation and deployment guides
- **Repository**: `https://github.com/drewalbert7/orthoandspinetools.git`

## 🩺 Medical Specialties

The platform includes dedicated communities for 9 orthopedic specialties:

1. **Foot & Ankle** - Podiatric and ankle surgery discussions
2. **Spine** - Spinal surgery and spine-related conditions
3. **Ortho Trauma** - Emergency orthopedic procedures
4. **Ortho Oncology** - Bone and soft tissue tumors
5. **Peds Ortho** - Pediatric orthopedic surgery
6. **Shoulder Elbow** - Upper extremity procedures
7. **Hand** - Hand and wrist surgery
8. **Sports** - Sports medicine and athletic injuries
9. **Adult Reconstruction** - Joint replacement and reconstruction

### Infrastructure
- **Docker** + **Docker Compose**
- **Nginx** reverse proxy
- **SSL/TLS** encryption
- **PostgreSQL** with connection pooling

### Production deployment & scaling
- **[docs/WHAT_TO_DO.md](docs/WHAT_TO_DO.md)** — **start here**: plain-English checklist (what you must do vs optional scaling docs)
- **[docs/PRODUCTION_SCALING.md](docs/PRODUCTION_SCALING.md)** — deploy checklist, connection pooling, horizontal scaling, health checks, backups
- **`.env.example`** — template for secrets and pool-related settings
- **`docker-compose.prod.yml`** — production stack with healthchecks and Prisma pool params on `DATABASE_URL`
- **`docker-compose.scale.example.yml`** — notes for multiple backend replicas behind nginx

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Docker & Docker Compose

### Development Setup
```bash
# Clone repository
git clone https://github.com/drewalbert7/orthoandspinetools.git
cd orthoandspinetools

# Start development environment
docker compose up -d

# Install dependencies
cd backend && npm install
cd ../frontend && npm install

# Run database migrations
cd backend && npx prisma migrate dev

# Start development servers
# Backend runs on port 3001
# Frontend runs on port 3000
```

## 🔒 HIPAA Compliance Features

- **Data Encryption** - All data encrypted in transit and at rest
- **Access Controls** - Role-based permissions for medical data
- **Audit Logging** - Complete activity tracking
- **Data Minimization** - Only collect necessary information
- **Secure Authentication** - Multi-factor authentication support
- **Data Retention** - Configurable data retention policies

## 📋 Core Features

### User Management
- Professional registration with medical credentials
- Profile management with specialty information
- Secure authentication and authorization

### Communities
- Specialty-based communities (orthopedic subspecialties)
- Tool-specific communities (implant discussions, etc.)
- Private groups for sensitive discussions

### Medical Tools Database
- Searchable database of orthopedic and spine tools
- Tool reviews and ratings by professionals
- Manufacturer information and specifications
- Cost and availability tracking

### Discussion Platform
- Posts and comments system
- Case discussions (anonymized)
- Tool recommendations and reviews
- Professional networking

### Professional Features
- Medical credential verification
- Specialty-specific content filtering
- Continuing education integration
- Research collaboration tools

## 🌐 Deployment

### Production Environment
- **Domain**: orthoandspinetools.com
- **SSL**: Let's Encrypt certificates
- **Database**: PostgreSQL with backups
- **Monitoring**: Health checks and logging
- **Security**: Firewall and intrusion detection

## 📚 Documentation

- [API Documentation](docs/api.md)
- [Database Schema](docs/database.md)
- [HIPAA Compliance Guide](docs/hipaa-compliance.md)
- [Deployment Guide](docs/deployment.md)
- [Contributing Guidelines](docs/contributing.md)

## 🤝 Contributing

We welcome contributions from medical professionals and developers. Please see our [Contributing Guidelines](docs/contributing.md) for details.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:
- **Email**: support@orthoandspinetools.com
- **Documentation**: [docs/](docs/)
- **Issues**: GitHub Issues
- **Live Site**: https://orthoandspinetools.com

---

**Built with ❤️ for the orthopedic and spine professional community**
