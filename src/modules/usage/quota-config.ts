export function getWorkspaceMonthlyTokenLimit(): number | null {
  const raw = process.env.WORKSPACE_MONTHLY_TOKEN_LIMIT;
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function getQuotaStatus(used: number, limit: number | null) {
  if (!limit) return { percent: 0, warning: false, exceeded: false };
  const percent = Math.min(100, Math.round((used / limit) * 100));
  return {
    percent,
    warning: percent >= 80,
    exceeded: used >= limit,
  };
}
