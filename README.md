# OrthoAndSpineTools

A custom-built medical-focused community platform designed specifically for orthopedic and spine professionals.

## 🏥 Project Overview

OrthoAndSpineTools is a specialized social platform that brings together medical professionals in orthopedic and spine specialties. Built from the ground up as a custom solution, it provides a secure, HIPAA-compliant platform for medical professionals to collaborate, share knowledge, and network.

## 🎯 Target Audience

- **Orthopedic Surgeons**
- **Spine Specialists** 
- **Medical Residents**
- **Physical Therapists**
- **Medical Students**
- **Healthcare Professionals**

## 🏗️ Architecture

This project consists of three main components:

### Backend (`orthoandspinetools-medical-platform/backend/`)
- **Technology**: Node.js + TypeScript + Prisma ORM
- **Features**: Custom medical API with specialty-specific endpoints
- **Database**: PostgreSQL with medical-focused schema
- **Security**: HIPAA-compliant data handling

### Frontend (`orthoandspinetools-medical-platform/frontend/`)
- **Technology**: React + Vite + TypeScript
- **Features**: Modern medical community interface
- **UI**: Custom medical specialty components and dashboards
- **Responsive**: Mobile-optimized for medical workflows

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

## 🚀 Quick Start

### Prerequisites
- Docker and Docker Compose
- Node.js (for development)
- PostgreSQL database
- Redis cache (optional)

### Backend Setup
```bash
cd ~/orthoandspinetools-medical-platform/backend
npm install
npm run dev
```

### Frontend Setup
```bash
cd ~/orthoandspinetools-medical-platform/frontend
npm install
npm run dev
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

- Medical community inspiration from orthopedic professionals
- Open source medical education initiatives
- Healthcare technology innovation
- Medical professional community feedback

---

**For detailed development information, see [CLAUDE.md](CLAUDE.md)**