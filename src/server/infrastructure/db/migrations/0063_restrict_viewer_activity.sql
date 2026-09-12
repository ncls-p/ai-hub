-- Usage and audit expose other users' activity and require explicit delegation.
-- Preserve custom roles, administrator grants and all role assignments.
UPDATE roles
SET permissions_json = permissions_json - 'usage.view' - 'audit.view',
    description = 'Read-only access to project resources.',
    updated_at = now()
WHERE is_system = true
  AND scope_type = 'workspace'
  AND name = 'workspace.viewer';
