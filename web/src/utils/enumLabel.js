// Converts an ENUM-style value (e.g. 'WELL_ABOVE_NORMAL') into a readable label ('Well above normal').
export const enumLabel = (v) => v.charAt(0) + v.slice(1).toLowerCase().replaceAll('_', ' ')
