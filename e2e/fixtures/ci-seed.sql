-- Minimal fixture data for CI / local pre-deploy checks.
-- The checks FAIL when the home feed has no posts or the implant directory is empty,
-- so an empty CI database must be given one community, one post and a few implants.
-- Idempotent: safe to run more than once. Never run against production.

INSERT INTO "users" ("id", "email", "username", "firstName", "lastName", "passwordHash",
                     "isEmailVerified", "isActive", "is_admin", "createdAt", "updatedAt")
VALUES ('ci_user_admin', 'ci-admin@example.invalid', 'ci_admin', 'CI', 'Admin',
        '$2a$10$ciFixtureHashNotARealPasswordxxxxxxxxxxxxxxxxxxxxxxxxx', true, true, true, NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "communities" ("id", "name", "slug", "description", "ownerId", "createdAt", "updatedAt")
VALUES ('ci_community_spine', 'Spine', 'spine', 'Spine surgery discussion (CI fixture).', 'ci_user_admin', NOW(), NOW())
ON CONFLICT DO NOTHING;

INSERT INTO "posts" ("id", "title", "content", "type", "authorId", "communityId", "createdAt", "updatedAt")
VALUES
  ('ci_post_0001', 'CI fixture: ACDF graft choice', 'Fixture post so the home feed has content in CI.',
   'discussion', 'ci_user_admin', (SELECT "id" FROM "communities" WHERE "slug" = 'spine'), NOW(), NOW()),
  ('ci_post_0002', 'CI fixture: cervical disc replacement follow-up', 'Second fixture post.',
   'discussion', 'ci_user_admin', (SELECT "id" FROM "communities" WHERE "slug" = 'spine'), NOW() - INTERVAL '1 hour', NOW())
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "implants" ("id", "slug", "brand_name", "system_name", "company", "specialty", "anatomy",
                        "device_class", "status", "search_text", "created_at", "updated_at")
VALUES
  ('ci_implant_0001', 'ci-cervical-disc', 'CI Cervical Disc', 'CI Cervical Disc System', 'Fixture Medical',
   'spine', 'cervical', 'cervical_disc', 'verified', 'ci cervical disc fixture medical', NOW(), NOW()),
  ('ci_implant_0002', 'ci-knee-system', 'CI Knee', 'CI Total Knee System', 'Fixture Ortho',
   'hip-knee-arthroplasty', 'knee', 'tka', 'published', 'ci knee fixture ortho', NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;
