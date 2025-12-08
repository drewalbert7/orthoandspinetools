# Protected Critical Files

This document lists critical files that are protected from accidental deletion or modification.

## Protection Measures

1. **File Header Comments**: Critical files contain warning comments at the top
2. **Protection Script**: `scripts/protect-critical-files.sh` validates critical files
3. **Git Pre-commit Hook**: Automatically runs protection checks before commits
4. **Backup Files**: Critical files have `.backup` versions in version control
5. **Route Comments**: App.tsx has comments marking critical routes

## Protected Files

### `frontend/src/pages/CreatePost.tsx`
- **Status**: ✅ Protected
- **Size**: ~873 lines (~28KB)
- **Purpose**: Reddit-style post creation page with full functionality
- **Route**: `/create-post`
- **Backup**: `frontend/src/pages/CreatePost.tsx.backup`
- **Last Verified**: December 8, 2025

**Features:**
- Community selection dropdown
- Post type tabs (Text, Images & Video, Link, Poll)
- Rich text editor with WYSIWYG formatting
- Media upload functionality
- Tag selection (community-specific)
- Form validation and submission

**If this file is deleted:**
1. Restore from backup: `cp frontend/src/pages/CreatePost.tsx.backup frontend/src/pages/CreatePost.tsx`
2. Or restore from git: `git checkout HEAD -- frontend/src/pages/CreatePost.tsx`
3. Verify the route exists in `App.tsx`
4. Rebuild frontend: `docker compose build frontend`

### Other Critical Files
- `frontend/src/pages/Home.tsx` - Main home page
- `frontend/src/pages/PostDetail.tsx` - Post detail view
- `frontend/src/components/Header.tsx` - Application header
- `frontend/src/components/Sidebar.tsx` - Left sidebar navigation
- `frontend/src/App.tsx` - Main app router

## Running Protection Checks

### Manual Check
```bash
./scripts/protect-critical-files.sh
```

### Automatic Check (Git Pre-commit)
The pre-commit hook automatically runs protection checks before every commit. If a critical file is missing or invalid, the commit will be blocked.

### CI/CD Integration
Add to your CI/CD pipeline:
```yaml
- name: Check Critical Files
  run: ./scripts/protect-critical-files.sh
```

## Restoring a Protected File

If a protected file is accidentally deleted:

1. **From Backup** (if available):
   ```bash
   cp frontend/src/pages/CreatePost.tsx.backup frontend/src/pages/CreatePost.tsx
   ```

2. **From Git History**:
   ```bash
   git checkout HEAD -- frontend/src/pages/CreatePost.tsx
   # Or from a specific commit:
   git checkout <commit-hash> -- frontend/src/pages/CreatePost.tsx
   ```

3. **Verify Restoration**:
   ```bash
   ./scripts/protect-critical-files.sh
   ```

4. **Rebuild**:
   ```bash
   docker compose build frontend
   docker compose up -d frontend
   ```

## Modifying Protected Files

Before modifying a protected file:

1. **Create a backup**:
   ```bash
   cp frontend/src/pages/CreatePost.tsx frontend/src/pages/CreatePost.tsx.backup.$(date +%Y%m%d)
   ```

2. **Make your changes**

3. **Test thoroughly**:
   - Test all functionality
   - Verify routes still work
   - Check for TypeScript errors
   - Run protection script

4. **Update backup if changes are good**:
   ```bash
   cp frontend/src/pages/CreatePost.tsx frontend/src/pages/CreatePost.tsx.backup
   ```

## File Size Requirements

Protected files must meet minimum size requirements:
- `CreatePost.tsx`: > 20KB (currently ~28KB) ✅
- `Home.tsx`: > 5KB
- `PostDetail.tsx`: > 10KB
- `Header.tsx`: > 5KB
- `Sidebar.tsx`: > 5KB
- `App.tsx`: > 2KB

Files smaller than these thresholds may be incomplete or corrupted.

## History

- **December 8, 2025**: Added comprehensive protection for CreatePost.tsx after accidental deletion incident
- **December 8, 2025**: Created protection script and git pre-commit hook
- **December 8, 2025**: Added backup file and documentation

