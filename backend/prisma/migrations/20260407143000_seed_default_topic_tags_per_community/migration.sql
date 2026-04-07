INSERT INTO "community_tags" ("id", "communityId", "name", "color", "description", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c."id", d.name, d.color, d.description, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM "communities" c
CROSS JOIN (
  VALUES
    ('Startup', '#2563eb', 'Startups, companies, and entrepreneurial topics'),
    ('Medical Device', '#0891b2', 'Implants, instruments, and regulated devices'),
    ('Technique', '#7c3aed', 'Surgical techniques, approaches, and how-to discussion'),
    ('Research', '#059669', 'Studies, evidence, and academic or clinical research'),
    ('Biologic', '#db2777', 'Biologics, growth factors, and related therapies'),
    ('Tech', '#4f46e5', 'Software, AI, digital health, and engineering'),
    ('Tool', '#ca8a04', 'Instruments, equipment, and practical tools')
) AS d(name, color, description)
WHERE NOT EXISTS (
  SELECT 1
  FROM "community_tags" t
  WHERE t."communityId" = c."id" AND t."name" = d.name
);
