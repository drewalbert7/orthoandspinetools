# Architecture Overview

This document describes the technical architecture of OrthoAndSpineTools, a medical-focused community platform built on Lemmy.

## 🏗️ System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    OrthoAndSpineTools                       │
├─────────────────────────────────────────────────────────────┤
│  Frontend (TypeScript + Inferno)                           │
│  ├── Medical Communities Component                          │
│  ├── Specialty-specific UI Components                      │
│  └── Medical Professional Dashboard                       │
├─────────────────────────────────────────────────────────────┤
│  Backend (Rust + Actix)                                     │
│  ├── Medical API Endpoints                                 │
│  ├── Community Management                                  │
│  └── Medical Data Validation                               │
├─────────────────────────────────────────────────────────────┤
│  Database (PostgreSQL)                                      │
│  ├── Medical Communities Data                              │
│  ├── User Profiles & Roles                                 │
│  └── Medical Content & Discussions                         │
└─────────────────────────────────────────────────────────────┘
```

## 🎯 Core Components

### 1. Frontend Architecture (`orthoandspinetools-frontend/`)

**Technology Stack:**
- **Framework**: Inferno.js (React-like)
- **Language**: TypeScript
- **Build Tool**: Webpack
- **Styling**: Bootstrap + Custom Medical Themes
- **State Management**: Inferno Component State

**Key Components:**
```typescript
src/shared/components/
├── home/
│   ├── medical-communities.tsx    # 9 medical specialties
│   └── home.tsx                   # Main homepage
├── medical/
│   ├── specialty-dashboard.tsx    # Specialty-specific UI
│   ├── medical-professional.tsx   # Professional profiles
│   └── medical-content.tsx        # Medical content display
└── common/
    ├── icon.tsx                   # Medical icons
    └── medical-badge.tsx          # Professional badges
```

**Medical Specialties Integration:**
- **Foot & Ankle**: Podiatric surgery discussions
- **Spine**: Spinal surgery and conditions
- **Ortho Trauma**: Emergency procedures
- **Ortho Oncology**: Bone/soft tissue tumors
- **Peds Ortho**: Pediatric surgery
- **Shoulder Elbow**: Upper extremity
- **Hand**: Hand/wrist surgery
- **Sports**: Sports medicine
- **Adult Reconstruction**: Joint replacement

### 2. Backend Architecture (`orthoandspinetools-backend/`)

**Technology Stack:**
- **Language**: Rust
- **Web Framework**: Actix Web
- **Database ORM**: Diesel
- **Database**: PostgreSQL
- **API**: RESTful + GraphQL

**Core Modules:**
```rust
src/
├── api/
│   ├── medical_communities.rs     # Medical specialty APIs
│   ├── medical_professionals.rs   # Professional management
│   └── medical_content.rs        # Medical content APIs
├── models/
│   ├── medical_specialty.rs      # Specialty data models
│   ├── medical_professional.rs   # Professional profiles
│   └── medical_content.rs        # Medical content models
└── services/
    ├── medical_validation.rs     # Medical content validation
    ├── professional_auth.rs      # Professional authentication
    └── medical_moderation.rs     # Medical content moderation
```

**API Endpoints:**
- `GET /api/v3/medical/specialties` - List medical specialties
- `POST /api/v3/medical/professionals` - Register medical professional
- `GET /api/v3/medical/content/{id}` - Get medical content
- `POST /api/v3/medical/communities` - Create medical community

### 3. Database Schema

**Core Tables:**
```sql
-- Medical Specialties
CREATE TABLE medical_specialties (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) UNIQUE NOT NULL,
    icon VARCHAR(50),
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Medical Professionals
CREATE TABLE medical_professionals (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    specialty_id INTEGER REFERENCES medical_specialties(id),
    license_number VARCHAR(50),
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Medical Communities
CREATE TABLE medical_communities (
    id SERIAL PRIMARY KEY,
    community_id INTEGER REFERENCES communities(id),
    specialty_id INTEGER REFERENCES medical_specialties(id),
    medical_focus TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

## 🔄 Data Flow

### 1. User Registration Flow
```
User Registration → Medical Professional Verification → 
Specialty Assignment → Community Access → Medical Dashboard
```

### 2. Medical Content Flow
```
Medical Professional → Content Creation → Medical Validation → 
Community Posting → Professional Discussion → Moderation
```

### 3. Community Management Flow
```
Medical Professional → Community Creation → Specialty Assignment → 
Moderation Setup → Professional Access → Content Management
```

## 🛡️ Security Architecture

### Authentication & Authorization
- **JWT Tokens**: Secure authentication
- **Role-Based Access**: Medical professional roles
- **Multi-Factor Authentication**: Required for medical professionals
- **Session Management**: Secure session handling

### Medical Data Protection
- **Encryption**: AES-256 for medical data
- **Access Control**: Role-based medical data access
- **Audit Logging**: Comprehensive medical data access logs
- **HIPAA Compliance**: Healthcare privacy compliance

### API Security
- **Rate Limiting**: Prevent abuse of medical APIs
- **Input Validation**: Medical content validation
- **CORS Configuration**: Secure cross-origin requests
- **Security Headers**: Medical data protection headers

## 📊 Performance Architecture

### Backend Performance
- **Database Optimization**: Indexed medical data queries
- **Caching Strategy**: Redis caching for medical content
- **Load Balancing**: Multiple backend instances
- **CDN Integration**: Fast medical content delivery

### Frontend Performance
- **Code Splitting**: Lazy loading of medical components
- **Asset Optimization**: Optimized medical images/icons
- **Progressive Web App**: Offline medical content access
- **Mobile Optimization**: Responsive medical interfaces

## 🔧 Development Architecture

### Local Development
```bash
# Backend Development
cd ~/orthoandspinetools-backend
cargo run --bin lemmy_server

# Frontend Development
cd ~/orthoandspinetools-frontend
pnpm dev

# Database Setup
docker-compose up -d postgres
```

### Testing Architecture
- **Unit Tests**: Individual component testing
- **Integration Tests**: API endpoint testing
- **Medical Validation Tests**: Medical content accuracy
- **Security Tests**: Medical data protection testing

### Deployment Architecture
- **Docker Containers**: Containerized medical services
- **Database Migrations**: Automated medical schema updates
- **Environment Configuration**: Medical-specific configurations
- **Monitoring**: Medical platform health monitoring

## 🌐 Federation Architecture

### Lemmy Federation
- **ActivityPub Protocol**: Federated medical communities
- **Cross-Instance Communication**: Medical professional networking
- **Content Sharing**: Medical content federation
- **Community Discovery**: Medical community discovery

### Medical Community Federation
- **Specialty Networks**: Cross-instance medical specialties
- **Professional Networking**: Medical professional connections
- **Content Collaboration**: Medical content sharing
- **Research Collaboration**: Medical research discussions

## 📈 Scalability Architecture

### Horizontal Scaling
- **Load Balancers**: Distribute medical traffic
- **Database Sharding**: Scale medical data storage
- **Microservices**: Modular medical services
- **CDN Distribution**: Global medical content delivery

### Vertical Scaling
- **Resource Optimization**: Efficient medical data processing
- **Caching Layers**: Multi-level medical content caching
- **Database Optimization**: Optimized medical queries
- **Memory Management**: Efficient medical data handling

## 🔍 Monitoring Architecture

### Application Monitoring
- **Health Checks**: Medical service health monitoring
- **Performance Metrics**: Medical API performance tracking
- **Error Tracking**: Medical application error monitoring
- **User Analytics**: Medical professional usage analytics

### Medical Data Monitoring
- **Content Moderation**: Medical content quality monitoring
- **Professional Verification**: Medical professional status tracking
- **Compliance Monitoring**: HIPAA compliance monitoring
- **Security Monitoring**: Medical data security monitoring

---

This architecture ensures a robust, secure, and scalable platform for medical professionals while maintaining the flexibility and federation capabilities of the underlying Lemmy platform.
