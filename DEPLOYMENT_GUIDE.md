# 🚀 **Deployment Guide - Voting System Protection**

## ⚠️ **CRITICAL: Always Run Pre-Deployment Checks**

Before deploying any changes that might affect the voting system, **ALWAYS** run:

```bash
cd /home/dstrad/orthoandspinetools-main
./scripts/pre-deployment-checklist.sh
```

## 📋 **Pre-Deployment Checklist**

### ✅ **Required Checks**
1. **VoteButton Component**: Must have proper upvote/downvote handlers
2. **Database Columns**: All raw SQL queries must use camelCase (`"userId"`, `"communityId"`, `"visitDate"`)
3. **Vote Usage**: VoteButton must be used in Home.tsx, Community.tsx, and PostDetail.tsx
4. **API Endpoints**: Communities and Posts APIs must be responding
5. **Build Status**: Source files must be compiled (backend and frontend)

### 🚨 **Common Issues & Fixes**

#### **Issue: Database Column Errors**
```bash
# Error: column "user_id" does not exist
# Fix: Rebuild backend
docker-compose build backend
docker-compose up -d backend
```

#### **Issue: VoteButton Not Working**
```bash
# Fix: Rebuild frontend
docker-compose build frontend
docker-compose up -d frontend
```

#### **Issue: Source Files Newer Than Compiled**
```bash
# Fix: Rebuild both services
docker-compose build backend frontend
docker-compose up -d backend frontend
```

## 🔄 **Deployment Process**

### **Step 1: Pre-Deployment Check**
```bash
./scripts/pre-deployment-checklist.sh
```
**Must pass all checks before proceeding!**

### **Step 2: Deploy Changes**
```bash
# If backend changes
docker-compose build backend
docker-compose up -d backend

# If frontend changes  
docker-compose build frontend
docker-compose up -d frontend

# If both changed
docker-compose build backend frontend
docker-compose up -d backend frontend
```

### **Step 3: Post-Deployment Verification**
```bash
# Test voting functionality
curl -X POST https://orthoandspinetools.com/api/posts/post2/vote \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"upvote"}'

# Should return: {"success":true,"message":"Vote recorded","data":{"voteType":"upvote"}}
```

### **Step 4: Manual Testing**
1. **Home Page**: Test voting on posts
2. **Community Page**: Test voting on community posts  
3. **Post Detail Page**: Test voting on individual posts
4. **Verify**: Upvote adds +1, downvote adds -1

## 🛡️ **Prevention Measures**

### **Database Column Names**
- ✅ **Correct**: `"userId"`, `"communityId"`, `"visitDate"`
- ❌ **Wrong**: `user_id`, `community_id`, `visit_date`

### **VoteButton Component**
- ✅ **Must Have**: `handleVote('upvote')` and `handleVote('downvote')`
- ✅ **Must Have**: `voteType === 'upvote' ? 1 : -1` logic
- ✅ **Must Have**: Proper visual feedback (orange/blue highlights)

### **API Contract**
- ✅ **Frontend**: Sends `{"type":"upvote"}` or `{"type":"downvote"}`
- ✅ **Backend**: Processes as `value: 1` or `value: -1`

## 🚨 **Emergency Procedures**

### **If Voting System Breaks After Deployment:**

1. **Immediate Rollback**:
   ```bash
   # Revert to previous working version
   git checkout HEAD~1
   docker-compose build backend frontend
   docker-compose up -d backend frontend
   ```

2. **Identify Issue**:
   ```bash
   # Check logs
   docker-compose logs backend --tail=50
   docker-compose logs frontend --tail=50
   
   # Run health check
   ./scripts/voting-health-check.sh --verbose
   ```

3. **Fix and Redeploy**:
   ```bash
   # Fix the issue
   # Then rebuild and redeploy
   docker-compose build backend frontend
   docker-compose up -d backend frontend
   ```

## 📊 **Success Indicators**

### **Voting System is Healthy When:**
- ✅ Pre-deployment checklist passes
- ✅ API endpoints respond correctly
- ✅ VoteButton component has proper handlers
- ✅ Database queries use correct column names
- ✅ Upvote adds +1, downvote adds -1
- ✅ Toggle functionality works (click same vote to remove)
- ✅ Switch functionality works (upvote to downvote)

### **Monitoring Commands:**
```bash
# Check system health
./scripts/voting-health-check.sh

# Check recent logs
docker-compose logs backend --tail=20
docker-compose logs frontend --tail=20

# Test API
curl -s https://orthoandspinetools.com/api/communities | head -5
```

## 📞 **Support**

If voting system issues persist:
1. Check `docs/VOTING_SYSTEM_PREVENTION.md` for detailed troubleshooting
2. Review backend logs for specific error messages
3. Verify all prevention measures are in place
4. Consider rolling back to last working version

**Remember**: The voting system is critical for user engagement. Always prioritize its stability over new features.