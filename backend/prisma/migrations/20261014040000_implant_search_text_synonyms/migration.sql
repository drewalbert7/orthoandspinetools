-- Refresh search_text with specialty labels + clinical synonyms for smarter directory search

UPDATE "implants" i
SET "search_text" = trim(both ' ' FROM concat_ws(' ',
  i."brand_name",
  COALESCE(i."system_name", ''),
  COALESCE(i."company", ''),
  i."specialty",
  CASE i."specialty"
    WHEN 'spine' THEN 'Spine spine spinal cervical lumbar thoracolumbar acdf tdr disc arthroplasty pedicle sacroiliac si fusion'
    WHEN 'hip-knee-arthroplasty' THEN 'Hip & Knee Arthroplasty hip knee tha tka arthroplasty total hip total knee uka partial knee joint replacement'
    WHEN 'shoulder-elbow' THEN 'Shoulder Elbow shoulder elbow rsa reverse shoulder humeral glenoid'
    WHEN 'sports' THEN 'Sports sports medicine suture anchor rotator cuff acl arthroscope soft tissue'
    WHEN 'ortho-trauma' THEN 'Ortho Trauma trauma fracture intramedullary im nail nailing plate fixation proximal femur'
    WHEN 'foot-ankle' THEN 'Foot & Ankle foot ankle total ankle taa calcaneus talus'
    WHEN 'hand' THEN 'Hand hand wrist druj carpal finger phalanx'
    WHEN 'ortho-peds' THEN 'Ortho Peds pediatric peds paediatric growth epiphys'
    WHEN 'ortho-onc' THEN 'Ortho Onc oncology tumor tumour megaprosthesis limb salvage'
    WHEN 'biologics' THEN 'Biologics biologic biologics bmp rhbmp allograft bone graft dbm prp infuse'
    ELSE ''
  END,
  COALESCE(i."anatomy", ''),
  replace(i."device_class", '_', ' '),
  COALESCE(i."description", ''),
  COALESCE(i."long_description", ''),
  COALESCE(i."maude_brand_key", ''),
  COALESCE((
    SELECT string_agg(a."alias", ' ')
    FROM "implant_aliases" a
    WHERE a."implant_id" = i."id"
  ), '')
));
