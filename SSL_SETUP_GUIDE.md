# SSL/HTTPS Setup Guide for OrthoAndSpineTools

## ✅ **SSL Setup Complete**

Your OrthoAndSpineTools platform now has a fully functional HTTPS setup with Let's Encrypt SSL certificates.

## 🔐 **Current SSL Configuration**

### **Certificate Details**
- **Domain**: orthoandspinetools.com, www.orthoandspinetools.com
- **Certificate Authority**: Let's Encrypt
- **Certificate Type**: ECDSA
- **Expiry Date**: December 30, 2025 (89 days from setup)
- **Auto-Renewal**: Configured (every Monday at 2:30 AM)

### **Security Features**
- ✅ **HTTP/2** enabled
- ✅ **TLS 1.2 and 1.3** only
- ✅ **Modern cipher suites** (ECDHE-RSA-AES256-GCM-SHA512, etc.)
- ✅ **OCSP stapling** enabled
- ✅ **HSTS** with preload directive
- ✅ **Security headers** (X-Frame-Options, CSP, etc.)
- ✅ **HTTP to HTTPS redirect** (301 permanent)

## 🛠️ **SSL Management Scripts**

### **1. Certificate Renewal**
```bash
./update-ssl-certs.sh
```
- Renews certificates from Let's Encrypt
- Copies certificates to accessible location
- Reloads nginx without downtime

### **2. Manual SSL Setup** (if needed)
```bash
./setup-ssl.sh
```
- Complete SSL setup from scratch
- Only run if certificates are corrupted or missing

### **3. Certificate Status Check**
```bash
docker run --rm -v $(pwd)/nginx/ssl/letsencrypt:/etc/letsencrypt certbot/certbot certificates
```

## 🔄 **Automatic Renewal**

### **Cron Job**
- **Schedule**: Every Monday at 2:30 AM
- **Log File**: `/home/dstrad/ssl-renewal.log`
- **Command**: `./update-ssl-certs.sh`

### **Manual Renewal Check**
```bash
# Check if renewal is needed
docker run --rm -v $(pwd)/nginx/ssl/letsencrypt:/etc/letsencrypt certbot/certbot renew --dry-run

# Force renewal (if needed)
./update-ssl-certs.sh
```

## 🚨 **Troubleshooting**

### **Certificate Expired**
1. Run `./update-ssl-certs.sh`
2. Check logs: `tail -f /home/dstrad/ssl-renewal.log`
3. Verify: `curl -I https://orthoandspinetools.com`

### **Nginx SSL Errors**
1. Check certificate files: `ls -la nginx/ssl/certs/`
2. Test nginx config: `docker-compose exec nginx nginx -t`
3. Restart nginx: `docker-compose restart nginx`

### **Let's Encrypt Rate Limits**
- **Limit**: 50 certificates per registered domain per week
- **Solution**: Wait for rate limit reset or use staging environment

## 📁 **File Structure**

```
nginx/
├── nginx.conf              # Main nginx config (HTTPS)
├── nginx-ssl.conf          # SSL-enabled nginx config
├── nginx-temp.conf         # Temporary config for certificate setup
└── ssl/
    ├── certbot/            # Let's Encrypt challenge files
    ├── certs/              # Accessible certificate copies
    └── letsencrypt/        # Let's Encrypt certificates (root owned)
```

## 🔒 **Security Best Practices**

### **Certificate Security**
- Certificates are stored with proper permissions
- Private keys are not exposed in logs
- Automatic renewal prevents expiration

### **Nginx Security**
- Modern TLS configuration
- Security headers for medical platform
- Rate limiting on API endpoints
- CORS properly configured

### **Monitoring**
- Certificate expiry monitoring via cron
- Nginx access/error logs
- Health check endpoints

## 🌐 **Production URLs**

- **HTTPS**: https://orthoandspinetools.com
- **API**: https://orthoandspinetools.com/api/
- **Health Check**: https://orthoandspinetools.com/health

## 📋 **Maintenance Tasks**

### **Weekly**
- Check SSL renewal logs
- Monitor certificate expiry

### **Monthly**
- Review nginx access logs
- Update security headers if needed

### **Quarterly**
- Test SSL configuration
- Review Let's Encrypt policies

## 🆘 **Emergency Procedures**

### **SSL Certificate Issues**
1. **Immediate**: Switch to HTTP temporarily
2. **Fix**: Run `./setup-ssl.sh`
3. **Verify**: Test HTTPS functionality

### **Nginx Configuration Issues**
1. **Check**: `docker-compose exec nginx nginx -t`
2. **Restore**: Copy from backup config
3. **Reload**: `docker-compose restart nginx`

---

**Last Updated**: October 1, 2025  
**SSL Status**: ✅ **ACTIVE AND SECURE**  
**Next Renewal**: December 30, 2025 (Automatic)
