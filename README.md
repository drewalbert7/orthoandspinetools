<<<<<<< HEAD
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

### Infrastructure
- **Docker** + **Docker Compose**
- **Nginx** reverse proxy
- **SSL/TLS** encryption
- **PostgreSQL** with connection pooling
=======
# OrthoAndSpineTools

A medical-focused community platform built on Lemmy, designed specifically for orthopedic and spine professionals.

## 🏥 Project Overview

OrthoAndSpineTools is a specialized social platform that brings together medical professionals in orthopedic and spine specialties. Built on the robust Lemmy architecture, it provides a federated, self-hostable alternative to traditional medical forums.

## 🎯 Target Audience

- **Orthopedic Surgeons**
- **Spine Specialists** 
- **Medical Residents**
- **Physical Therapists**
- **Medical Students**
- **Healthcare Professionals**

## 🏗️ Architecture

This project consists of three main components:

### Backend (`orthoandspinetools-backend/`)
- **Technology**: Rust + Actix + Diesel
- **Base**: Lemmy backend fork
- **Repository**: `git@github.com:drewalbert7/lemmy.git`
- **Features**: Full API with medical community customizations

### Frontend (`orthoandspinetools-frontend/`)
- **Technology**: TypeScript + Inferno + Webpack
- **Base**: Lemmy UI fork
- **Repository**: `git@github.com:drewalbert7/lemmy-ui.git`
- **Features**: Medical specialty communities, custom UI components

### Documentation (`orthoandspinetools-main/`)
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
>>>>>>> 9829338e54b5c80ada18d55562e47e257ff1ddb6

## 🚀 Quick Start

### Prerequisites
<<<<<<< HEAD
- Node.js 18+
- PostgreSQL 14+
- Docker & Docker Compose

### Development Setup
```bash
# Clone repository
git clone <repository-url>
cd orthoandspinetools-medical-platform

# Start development environment
docker-compose up -d

# Install dependencies
cd backend && npm install
cd ../frontend && npm install

# Run database migrations
cd backend && npm run db:migrate

# Start development servers
npm run dev:backend    # Backend on port 3001
npm run dev:frontend   # Frontend on port 3000
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

---

**Built with ❤️ for the orthopedic and spine professional community**
=======
- Docker and Docker Compose
- Rust (for backend development)
- Node.js and pnpm (for frontend development)

### Backend Setup
```bash
cd ~/orthoandspinetools-backend
cargo build
```

### Frontend Setup
```bash
cd ~/orthoandspinetools-frontend
pnpm install
pnpm dev
```

### Production Deployment
See [docs/deployment.md](docs/deployment.md) for detailed deployment instructions.

## 📚 Documentation

- [Architecture Overview](docs/architecture.md)
- [Medical Specialties Guide](docs/medical-specialties.md)
- [Deployment Guide](docs/deployment.md)
- [Development Guidelines](CLAUDE.md)

## 🔗 Live Instance

- **Website**: https://orthoandspinetools.com
- **Status**: Active development

## 🤝 Contributing

This project is built on Lemmy's open-source foundation. Contributions are welcome!

1. Fork the relevant repository (backend or frontend)
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

This project is licensed under the AGPL-3.0 License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built on [Lemmy](https://github.com/LemmyNet/lemmy) - A link aggregator for the fediverse
- Medical community inspiration from orthopedic professionals
- Open source medical education initiatives

---

**For detailed development information, see [CLAUDE.md](CLAUDE.md)**
>>>>>>> 9829338e54b5c80ada18d55562e47e257ff1ddb6
