# Cloudinary Credentials Setup

## ⚠️ **CRITICAL: NEVER COMMIT ACTUAL CREDENTIALS TO GIT!**

## How to Set Up Cloudinary Credentials

### 1. Set Environment Variables (Recommended)

Create a `.env.cloudinary` file in the project root:

```bash
CLOUDINARY_CLOUD_NAME=dklzlt7hm
CLOUDINARY_API_KEY=729558359667584
CLOUDINARY_API_SECRET=YOUR_API_SECRET_HERE
```

**Note:** The `.env.cloudinary` file is already in `.gitignore` and will NOT be committed.

### 2. Load and Start Services

```bash
cd /home/dstrad/orthoandspinetools-main

# Load credentials from .env.cloudinary
export $(cat .env.cloudinary | xargs)

# Start services (they'll pick up the credentials from environment)
docker-compose up -d
```

### 3. Verify Credentials Are Loaded

```bash
docker-compose exec backend printenv | grep CLOUDINARY
```

### 4. Production Deployment

For production, set environment variables directly on the server:

```bash
# Set credentials in your shell
export CLOUDINARY_CLOUD_NAME=dklzlt7hm
export CLOUDINARY_API_KEY=729558359667584
export CLOUDINARY_API_SECRET=YOUR_SECRET

# Then start services
docker-compose up -d
```

## Current Credentials (Already Set)

- **Cloud Name:** dklzlt7hm
- **API Key:** 729558359667584  
- **API Secret:** (stored in .env.cloudinary file)

## Security Best Practices

✅ **DO:**
- Keep credentials in environment variables
- Use `.env.cloudinary` file (already in `.gitignore`)
- Store credentials securely on production server
- Rotate credentials periodically

❌ **DON'T:**
- Never commit credentials to git
- Don't hardcode credentials in source files
- Don't share credentials in documentation
- Don't expose credentials in logs

## Files to NEVER Commit

- `.env.cloudinary` - Contains actual credentials
- `docker-compose.yml` - Should use `${VARIABLE}` format
- Any file with actual API keys or secrets

## Current Status

✅ Credentials are stored in `.env.cloudinary` (not in git)
✅ `.gitignore` updated to protect credential files
✅ docker-compose.yml uses environment variables
✅ Production is using secure credentials
