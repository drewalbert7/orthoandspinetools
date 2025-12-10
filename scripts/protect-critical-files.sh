#!/bin/bash

# Script to protect critical frontend files from accidental deletion
# Run this script regularly or add it to CI/CD pipeline

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$PROJECT_ROOT/frontend/src"

# Critical files that must exist
CRITICAL_FILES=(
  "pages/CreatePost.tsx"
  "pages/Home.tsx"
  "pages/PostDetail.tsx"
  "components/Header.tsx"
  "components/Sidebar.tsx"
  "App.tsx"
)

# Minimum file sizes (in bytes) - CreatePost should be substantial
MIN_SIZES=(
  "pages/CreatePost.tsx:20000"  # ~20KB minimum (full implementation)
  "pages/Home.tsx:5000"
  "pages/PostDetail.tsx:10000"
  "components/Header.tsx:5000"
  "components/Sidebar.tsx:5000"
  "App.tsx:2000"
)

ERRORS=0

echo "🔒 Checking critical files for protection..."

for file in "${CRITICAL_FILES[@]}"; do
  filepath="$FRONTEND_DIR/$file"
  
  if [ ! -f "$filepath" ]; then
    echo "❌ ERROR: Critical file missing: $file"
    echo "   This file is essential for the application to function!"
    ERRORS=$((ERRORS + 1))
    continue
  fi
  
  # Check file size
  for size_check in "${MIN_SIZES[@]}"; do
    IFS=':' read -r check_file min_size <<< "$size_check"
    if [ "$file" == "$check_file" ]; then
      actual_size=$(wc -c < "$filepath")
      if [ "$actual_size" -lt "$min_size" ]; then
        echo "⚠️  WARNING: $file is suspiciously small ($actual_size bytes, expected > $min_size bytes)"
        echo "   File may have been truncated or corrupted!"
        ERRORS=$((ERRORS + 1))
      fi
    fi
  done
  
  # Check for placeholder text that indicates incomplete implementation
  if grep -q -i "coming soon\|placeholder\|TODO.*implement\|not implemented" "$filepath"; then
    echo "⚠️  WARNING: $file contains placeholder text - may be incomplete"
  fi
  
  # Check CreatePost specifically for critical components
  if [ "$file" == "pages/CreatePost.tsx" ]; then
    if ! grep -q "const CreatePost" "$filepath"; then
      echo "❌ ERROR: CreatePost.tsx missing main component definition!"
      ERRORS=$((ERRORS + 1))
    fi
    
    if ! grep -q "CRITICAL FILE" "$filepath"; then
      echo "⚠️  WARNING: CreatePost.tsx missing protection header comment"
    fi
    
    if ! grep -q "MarkdownEditor" "$filepath"; then
      echo "⚠️  WARNING: CreatePost.tsx may be missing MarkdownEditor integration"
    fi
    
    if ! grep -q "handleSubmit" "$filepath"; then
      echo "❌ ERROR: CreatePost.tsx missing handleSubmit function!"
      ERRORS=$((ERRORS + 1))
    fi
  fi
  
  echo "✅ $file exists and appears valid"
done

# Check App.tsx route registration
if [ -f "$FRONTEND_DIR/App.tsx" ]; then
  if ! grep -q "create-post" "$FRONTEND_DIR/App.tsx"; then
    echo "❌ ERROR: App.tsx missing /create-post route!"
    ERRORS=$((ERRORS + 1))
  fi
  
  if ! grep -q "CreatePost" "$FRONTEND_DIR/App.tsx"; then
    echo "❌ ERROR: App.tsx missing CreatePost import!"
    ERRORS=$((ERRORS + 1))
  fi
fi

if [ $ERRORS -eq 0 ]; then
  echo ""
  echo "✅ All critical files are protected and valid!"
  exit 0
else
  echo ""
  echo "❌ Found $ERRORS error(s) with critical files!"
  echo "   Please restore any missing files from git history or backups."
  exit 1
fi


