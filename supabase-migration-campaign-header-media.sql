-- Extend campaigns header support beyond IMAGE.
-- header_image_url is reused as the generic media URL (column name kept for BC).
-- header_media_type narrows the Meta payload shape ('image' default for legacy rows).
-- header_filename is required by Meta when media_type='document'.

alter table campaigns
  add column if not exists header_media_type text
    check (header_media_type in ('image', 'document', 'video')),
  add column if not exists header_filename text;
