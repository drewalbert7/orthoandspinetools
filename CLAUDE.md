# Development Guidelines

This document outlines the development workflow, coding standards, and best practices for the OrthoAndSpineTools project.

## 🏗️ Project Structure

```
orthoandspinetools-main/          # Main project documentation
├── README.md                      # Project overview
├── CLAUDE.md                     # This file
├── docs/                         # Documentation
│   ├── architecture.md
│   ├── medical-specialties.md
│   └── deployment.md
└── scripts/                      # Deployment scripts

orthoandspinetools-backend/       # Rust backend
├── src/                          # Source code
├── migrations/                   # Database migrations
├── config/                       # Configuration files
└── Cargo.toml                    # Rust dependencies

orthoandspinetools-frontend/      # TypeScript frontend
├── src/                          # Source code
├── lemmy-translations/           # Translation files
├── package.json                  # Node.js dependencies
└── webpack.config.js             # Build configuration
```

## 🎯 Development Philosophy

### Medical-First Approach
- **Patient Safety**: All features must consider medical accuracy and patient safety
- **Professional Standards**: Maintain high standards expected in medical communities
- **HIPAA Compliance**: Ensure all data handling meets healthcare privacy requirements
- **Evidence-Based**: Encourage evidence-based medical discussions

### Technical Standards
- **Code Quality**: Maintain high code quality with comprehensive testing
- **Documentation**: Document all medical-specific features thoroughly
- **Security**: Implement robust security measures for medical data
- **Performance**: Optimize for medical professionals' workflow needs

## 🛠️ Technology Stack

### Backend
- **Language**: Rust
- **Framework**: Actix Web
- **Database**: PostgreSQL with Diesel ORM
- **API**: RESTful API with GraphQL support
- **Authentication**: JWT-based authentication

### Frontend
- **Language**: TypeScript
- **Framework**: Inferno.js
- **Build Tool**: Webpack
- **Styling**: Bootstrap + Custom CSS
- **State Management**: Inferno state management

## 📋 Development Workflow

### 1. Feature Development
```bash
# Backend changes
cd ~/orthoandspinetools-backend
git checkout -b feature/medical-specialty-api
# Make changes
cargo test
git commit -m "Add medical specialty API endpoints"

# Frontend changes
cd ~/orthoandspinetools-frontend
git checkout -b feature/medical-communities-ui
# Make changes
pnpm test
git commit -m "Add medical communities UI component"
```

### 2. Testing Requirements
- **Backend**: All API endpoints must have unit tests
- **Frontend**: All components must have integration tests
- **Medical Features**: Specialized tests for medical data handling
- **Security**: Penetration testing for medical data protection

### 3. Code Review Process
1. **Medical Review**: Medical professionals review medical-specific features
2. **Technical Review**: Code quality and architecture review
3. **Security Review**: Security assessment for medical data handling
4. **Documentation Review**: Ensure proper documentation of medical features

## 🩺 Medical Specialty Development

### Adding New Medical Communities
1. **Research**: Validate medical specialty with professionals
2. **Design**: Create appropriate icons and branding
3. **Implementation**: Add to medical communities component
4. **Testing**: Test with medical professionals
5. **Documentation**: Document specialty-specific features

### Medical Data Handling
- **Patient Privacy**: Never store patient-identifiable information
- **Medical Accuracy**: Validate all medical content with professionals
- **Compliance**: Ensure HIPAA compliance for all features
- **Audit Trail**: Maintain logs for medical content moderation

## 🔒 Security Guidelines

### Medical Data Protection
- **Encryption**: All medical data encrypted in transit and at rest
- **Access Control**: Role-based access for medical professionals
- **Audit Logging**: Comprehensive logging of medical data access
- **Data Retention**: Clear policies for medical data retention

### Authentication & Authorization
- **Multi-Factor Authentication**: Required for medical professionals
- **Role-Based Access**: Different access levels for different medical roles
- **Session Management**: Secure session handling for medical workflows
- **API Security**: Rate limiting and authentication for all APIs

## 📊 Performance Standards

### Backend Performance
- **API Response Time**: < 200ms for medical data queries
- **Database Optimization**: Optimized queries for medical data
- **Caching**: Intelligent caching for medical content
- **Scalability**: Support for growing medical community

### Frontend Performance
- **Page Load Time**: < 3 seconds for medical community pages
- **Mobile Optimization**: Responsive design for mobile medical workflows
- **Accessibility**: WCAG 2.1 AA compliance for medical professionals
- **Offline Support**: Basic offline functionality for medical content

## 🧪 Testing Strategy

### Unit Testing
- **Backend**: 90% code coverage minimum
- **Frontend**: 85% code coverage minimum
- **Medical Features**: 100% coverage for medical data handling

### Integration Testing
- **API Testing**: Comprehensive API endpoint testing
- **Database Testing**: Medical data integrity testing
- **Security Testing**: Penetration testing for medical data
- **Performance Testing**: Load testing for medical workflows

### Medical Validation
- **Professional Review**: Medical professionals validate all medical features
- **Accuracy Testing**: Validate medical content accuracy
- **Compliance Testing**: Ensure HIPAA compliance
- **User Testing**: Test with actual medical professionals

## 📚 Documentation Standards

### Code Documentation
- **API Documentation**: Comprehensive API documentation with medical examples
- **Code Comments**: Clear comments explaining medical-specific logic
- **README Files**: Detailed setup instructions for each component
- **Architecture Docs**: Clear architecture documentation

### Medical Documentation
- **Medical Features**: Document all medical-specific features
- **Compliance Docs**: Document HIPAA compliance measures
- **User Guides**: Create guides for medical professionals
- **Best Practices**: Document medical community best practices

## 🚀 Deployment Guidelines

### Environment Setup
- **Development**: Local development with medical test data
- **Staging**: Staging environment with anonymized medical data
- **Production**: Production environment with full security measures

### Medical Data Handling
- **Development**: Use synthetic medical data only
- **Staging**: Use anonymized real medical data
- **Production**: Implement full HIPAA compliance measures

## 🔄 Continuous Integration

### Automated Testing
- **Code Quality**: Automated code quality checks
- **Security Scanning**: Automated security vulnerability scanning
- **Medical Validation**: Automated medical content validation
- **Performance Testing**: Automated performance regression testing

### Deployment Pipeline
- **Automated Deployment**: Automated deployment to staging
- **Medical Review**: Manual review for medical features
- **Security Review**: Security review for medical data changes
- **Production Deployment**: Controlled production deployment

## 📞 Support & Communication

### Development Team
- **Lead Developer**: Drew Albert (drewalbert7@gmail.com)
- **Medical Advisor**: [To be assigned]
- **Security Advisor**: [To be assigned]

### Communication Channels
- **GitHub Issues**: Technical issues and feature requests
- **Medical Forum**: Medical-specific discussions
- **Security Channel**: Security-related communications
- **Documentation**: All documentation in this repository

---

**Remember**: This is a medical platform. Every decision should prioritize patient safety, medical accuracy, and professional standards.
