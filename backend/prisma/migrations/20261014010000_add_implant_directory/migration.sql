-- Implant Directory (public catalog; reviews members-only)

CREATE TABLE "implants" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "brand_name" TEXT NOT NULL,
    "system_name" TEXT,
    "company" TEXT,
    "specialty" TEXT NOT NULL DEFAULT 'spine',
    "anatomy" TEXT,
    "device_class" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'published',
    "maude_brand_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "implants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "implant_aliases" (
    "id" TEXT NOT NULL,
    "implant_id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,

    CONSTRAINT "implant_aliases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "implant_images" (
    "id" TEXT NOT NULL,
    "implant_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT,
    "attribution" TEXT,
    "license_note" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "implant_images_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "implant_reviews" (
    "id" TEXT NOT NULL,
    "implant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "implant_reviews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "implants_slug_key" ON "implants"("slug");
CREATE INDEX "implants_specialty_status_idx" ON "implants"("specialty", "status");
CREATE INDEX "implants_device_class_idx" ON "implants"("device_class");
CREATE INDEX "implants_company_idx" ON "implants"("company");

CREATE UNIQUE INDEX "implant_aliases_implant_id_alias_key" ON "implant_aliases"("implant_id", "alias");
CREATE INDEX "implant_aliases_alias_idx" ON "implant_aliases"("alias");

CREATE INDEX "implant_images_implant_id_kind_idx" ON "implant_images"("implant_id", "kind");

CREATE UNIQUE INDEX "implant_reviews_implant_id_user_id_key" ON "implant_reviews"("implant_id", "user_id");
CREATE INDEX "implant_reviews_implant_id_created_at_idx" ON "implant_reviews"("implant_id", "created_at");

ALTER TABLE "implant_aliases" ADD CONSTRAINT "implant_aliases_implant_id_fkey" FOREIGN KEY ("implant_id") REFERENCES "implants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "implant_images" ADD CONSTRAINT "implant_images_implant_id_fkey" FOREIGN KEY ("implant_id") REFERENCES "implants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "implant_reviews" ADD CONSTRAINT "implant_reviews_implant_id_fkey" FOREIGN KEY ("implant_id") REFERENCES "implants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "implant_reviews" ADD CONSTRAINT "implant_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed: few spine implants (shell / dial-in set)
INSERT INTO "implants" ("id", "slug", "brand_name", "system_name", "company", "specialty", "anatomy", "device_class", "description", "status", "maude_brand_key", "updated_at", "published_at") VALUES
('cimplantseed0001prodiscc', 'prodisc-c', 'prodisc C', 'prodisc C Cervical Total Disc Replacement', 'Centinel Spine', 'spine', 'cervical', 'cervical_disc', 'Cervical total disc replacement system used for motion-preserving ACDF alternatives in indicated patients.', 'published', 'prodisc C', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cimplantseed0002mobicxxx', 'mobi-c', 'Mobi-C', 'Mobi-C Cervical Disc', 'Zimmer Biomet', 'spine', 'cervical', 'cervical_disc', 'Cervical disc arthroplasty prosthesis for one- or two-level degeneration in indicated patients.', 'published', 'Mobi-C', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cimplantseed0003cdhorizon', 'cd-horizon-solera', 'CD Horizon Solera', 'CD Horizon Solera Spinal System', 'Medtronic', 'spine', 'thoracolumbar', 'pedicle_screw', 'Thoracolumbar pedicle screw and rod fixation system widely used for fusion constructs.', 'published', 'CD Horizon Solera 5.5/6.0', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cimplantseed0004simplify', 'simplify-cervical-disc', 'Simplify Cervical Artificial Disc', 'Simplify Cervical Disc', 'NuVasive', 'spine', 'cervical', 'cervical_disc', 'MRI-friendly cervical total disc replacement with PEEK-on-ceramic articulation.', 'published', 'Simplify Cervical Artificial Disc', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cimplantseed0005infusexx', 'infuse-bone-graft', 'INFUSE Bone Graft', 'INFUSE / rhBMP-2', 'Medtronic', 'spine', 'lumbar', 'biologic', 'rhBMP-2 bone graft kit used as an adjunct in indicated spinal fusion procedures.', 'published', 'INFUSE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "implant_aliases" ("id", "implant_id", "alias") VALUES
('caliasseed0001prodisc', 'cimplantseed0001prodiscc', 'ProDisc-C'),
('caliasseed0002mobic', 'cimplantseed0002mobicxxx', 'MobiC'),
('caliasseed0003solera', 'cimplantseed0003cdhorizon', 'Solera'),
('caliasseed0004horizon', 'cimplantseed0003cdhorizon', 'CD Horizon'),
('caliasseed0005bmp', 'cimplantseed0005infusexx', 'rhBMP-2');
