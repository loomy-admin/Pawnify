/**
 * Settings Service — AppSetting CRUD (Sequelize MySQL)
 * Business-rule knobs that should never be hardcoded in application code.
 */

import { AppSetting, sequelize } from "@/lib/db";

export async function getSetting(key: string): Promise<string | null> {
  const setting = await AppSetting.findByPk(key);
  return setting?.value ?? null;
}

export async function getSettings() {
  const settings = await AppSetting.findAll({
    order: [["key", "ASC"]],
  });
  return settings.map((s) => s.toJSON());
}

export async function updateSetting(key: string, value: string) {
  const [setting] = await AppSetting.upsert({ key, value });
  return setting.toJSON();
}

export async function updateSettings(settings: Array<{ key: string; value: string }>) {
  return await sequelize.transaction(async (t) => {
    const results = [];
    for (const s of settings) {
      const [res] = await AppSetting.upsert(
        { key: s.key, value: s.value },
        { transaction: t }
      );
      results.push(res.toJSON());
    }
    return results;
  });
}

/**
 * Grouped settings for the admin UI.
 */
export function groupSettings(
  settings: Array<{ key: string; value: string }>
): Record<string, Array<{ key: string; value: string; label: string }>> {
  const groups: Record<string, Array<{ key: string; value: string; label: string }>> = {
    "LTV Slabs": [],
    Interest: [],
    "Grace Period": [],
    "PAN Threshold": [],
    Other: [],
  };

  const labelMap: Record<string, { group: string; label: string }> = {
    "ltv.tier1.max": { group: "LTV Slabs", label: "Tier 1 Max Value (₹)" },
    "ltv.tier1.percent": { group: "LTV Slabs", label: "Tier 1 LTV (%)" },
    "ltv.tier2.max": { group: "LTV Slabs", label: "Tier 2 Max Value (₹)" },
    "ltv.tier2.percent": { group: "LTV Slabs", label: "Tier 2 LTV (%)" },
    "ltv.tier3.percent": { group: "LTV Slabs", label: "Tier 3 LTV (%)" },
    "interest.default.monthly": { group: "Interest", label: "Default Monthly Rate (%)" },
    "grace.period.days": { group: "Grace Period", label: "Grace Period (days)" },
    "pan.threshold": { group: "PAN Threshold", label: "PAN Required Above (₹)" },
  };

  for (const setting of settings) {
    const meta = labelMap[setting.key];
    if (meta) {
      groups[meta.group].push({ ...setting, label: meta.label });
    } else {
      groups["Other"].push({ ...setting, label: setting.key });
    }
  }

  for (const key of Object.keys(groups)) {
    if (groups[key].length === 0) delete groups[key];
  }

  return groups;
}
