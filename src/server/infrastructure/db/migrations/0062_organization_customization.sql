-- Preserve existing navigation for existing organizations, then edit each copy independently.
INSERT INTO app_settings (key, value_json, updated_by_user_id, updated_at)
SELECT 'sidebarNavigation:organization:' || o.id::text, s.value_json, s.updated_by_user_id, now()
FROM organizations o CROSS JOIN app_settings s
WHERE s.key = 'sidebarNavigation'
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
-- A legacy automation model belongs to its provider's organization. Never copy credentials
-- or an implicit model grant into a different organization.
INSERT INTO app_settings (key, value_json, updated_by_user_id, updated_at)
SELECT 'chatAutomation:organization:' || o.id::text,
  CASE WHEN s.value_json->>'enabled' <> 'true' OR w.organization_id = o.id
    THEN s.value_json
    ELSE jsonb_build_object('enabled', false, 'generateTitles', true, 'generateSuggestions', true)
  END,
  s.updated_by_user_id, now()
FROM organizations o CROSS JOIN app_settings s
LEFT JOIN ai_providers p ON p.id::text = s.value_json->>'providerId'
LEFT JOIN workspaces w ON w.id = p.workspace_id
WHERE s.key = 'chatAutomation'
ON CONFLICT (key) DO NOTHING;
