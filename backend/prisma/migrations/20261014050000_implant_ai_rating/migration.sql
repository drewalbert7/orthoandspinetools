-- AI directory scores + cached member rating average

ALTER TABLE "implants" ADD COLUMN "ai_rating" DOUBLE PRECISION;
ALTER TABLE "implants" ADD COLUMN "ai_summary" TEXT;
ALTER TABLE "implants" ADD COLUMN "ai_rated_at" TIMESTAMP(3);
ALTER TABLE "implants" ADD COLUMN "member_rating_avg" DOUBLE PRECISION;

CREATE INDEX "implants_ai_rating_idx" ON "implants"("ai_rating");

-- Preliminary directory AI scores (editorial 0–10; not clinical advice)
UPDATE "implants" SET
  "ai_rating" = v.rating,
  "ai_summary" = v.summary,
  "ai_rated_at" = CURRENT_TIMESTAMP
FROM (VALUES
  ('prodisc-c', 8.6, 'Motion-preserving cervical TDR with broad clinical familiarity; strong directory identity and MAUDE linkage.'),
  ('mobi-c', 8.4, 'Widely recognized 1–2 level cervical disc arthroplasty platform with clear brand searchability.'),
  ('cd-horizon-solera', 8.2, 'Workhorse thoracolumbar pedicle fixation family; high OR recognition and MAUDE signal volume.'),
  ('simplify-cervical-disc', 8.1, 'MRI-friendly cervical TDR niche; distinctive materials story for directory differentiation.'),
  ('infuse-bone-graft', 7.4, 'High-impact rhBMP-2 biologic with extensive regulatory history — score reflects visibility, not endorsement.'),
  ('persona-knee', 8.3, 'Personalized TKA system with strong brand presence in hip-knee arthroplasty search.'),
  ('exeter-hip', 8.5, 'Classic cemented femoral stem with decades of outcome literature and clear THA identity.'),
  ('equinoxe-shoulder', 8.0, 'Anatomic/reverse shoulder platform covering common RSA and TSA use cases.'),
  ('swivelock-anchor', 7.9, 'Ubiquitous knotless sports-medicine anchor; high recognition in rotator-cuff workflows.'),
  ('tfn-advanced', 8.1, 'Proximal femoral nailing staple for trauma; clear device-class fit in directory search.'),
  ('infinity-ankle', 7.8, 'Modern total ankle arthroplasty option with growing foot-ankle directory relevance.'),
  ('aptis-druj', 7.5, 'Specialized DRUJ reconstruction prosthesis — niche but well-defined hand indication.'),
  ('pediloc', 7.7, 'Pediatric locked plating designed for growing skeleton; fills ortho-peds catalog gap.'),
  ('gmrs', 7.9, 'Modular oncology endoprosthesis for limb salvage — high specialty relevance.'),
  ('osteocel', 7.3, 'Cellular allograft biologic alternative; pairs with INFUSE-class directory discovery.')
) AS v(slug, rating, summary)
WHERE "implants"."slug" = v.slug AND "implants"."ai_rating" IS NULL;
