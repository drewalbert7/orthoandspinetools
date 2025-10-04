-- Database Scalability and Maintenance Script
-- This script helps maintain database performance as the platform scales

-- 1. ANALYZE tables to update statistics for query planner
ANALYZE users;
ANALYZE communities;
ANALYZE posts;
ANALYZE comments;
ANALYZE community_visitor_logs;
ANALYZE community_contributions;

-- 2. Check for missing indexes on frequently queried columns
-- These queries help identify slow queries that might need indexes

-- Check posts by community (most common query)
EXPLAIN (ANALYZE, BUFFERS) 
SELECT p.*, u."firstName", u."lastName", u.specialty 
FROM posts p 
JOIN users u ON p."authorId" = u.id 
WHERE p."communityId" = 'spine' 
  AND p."isDeleted" = false 
ORDER BY p."createdAt" DESC 
LIMIT 20;

-- Check weekly visitor counts (used in community metrics)
EXPLAIN (ANALYZE, BUFFERS)
SELECT COUNT(DISTINCT "user_id") as weekly_visitors
FROM community_visitor_logs 
WHERE "community_id" = 'spine' 
  AND "visit_date" >= NOW() - INTERVAL '7 days'
  AND "user_id" IS NOT NULL;

-- Check weekly contributions (used in community metrics)
EXPLAIN (ANALYZE, BUFFERS)
SELECT COUNT(*) as weekly_posts
FROM posts 
WHERE "communityId" = 'spine' 
  AND "createdAt" >= NOW() - INTERVAL '7 days'
  AND "isDeleted" = false;

-- 3. Cleanup old session data (run periodically)
DELETE FROM sessions 
WHERE "expiresAt" < NOW() 
  AND "isActive" = false;

-- 4. Cleanup old visitor logs (keep only last 90 days for performance)
DELETE FROM community_visitor_logs 
WHERE "visit_date" < NOW() - INTERVAL '90 days';

-- 5. Vacuum and reindex for maintenance (run during low traffic)
-- VACUUM ANALYZE users;
-- VACUUM ANALYZE posts;
-- VACUUM ANALYZE comments;
-- REINDEX TABLE posts;
-- REINDEX TABLE comments;

-- 6. Monitor table sizes and growth
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
    pg_stat_get_tuples_returned(c.oid) as tuples_returned,
    pg_stat_get_tuples_fetched(c.oid) as tuples_fetched
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
