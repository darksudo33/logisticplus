UPDATE shipment_form_template_sections sections
SET is_collapsed_by_default = CASE
    WHEN sections.section_key = 'base' THEN FALSE
    ELSE TRUE
  END,
  updated_at = NOW()
FROM shipment_form_templates templates
WHERE sections.template_id = templates.id
  AND templates.organization_id IS NULL
  AND templates.archived_at IS NULL;
