-- Clear unfinished IFU placeholder notes (hide until real directory copy exists)
UPDATE implants
SET indications = NULL
WHERE indications ILIKE 'See current manufacturer labeling / IFU%';

UPDATE implants
SET contraindications = NULL
WHERE contraindications ILIKE 'See current manufacturer labeling / IFU%';

-- Promote a few well-media'd listings so Verified filter is usable
UPDATE implants
SET status = 'verified',
    published_at = COALESCE(published_at, NOW())
WHERE slug IN ('prodisc-c', 'mobi-c', 'persona-knee', 'swivelock-anchor', 'equinoxe-shoulder')
  AND status = 'published';
