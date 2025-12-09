// src/utils/logger.js
function formatExtra(extra) {
  if (!extra) return "";
  try {
    return " " + JSON.stringify(extra);
  } catch {
    return " " + String(extra);
  }
}

export function logInfo(scope, message, extra = null) {
  const time = new Date().toISOString();
  console.log(`ℹ️ [${time}] [${scope}] ${message}${formatExtra(extra)}`);
}

export function logWarn(scope, message, extra = null) {
  const time = new Date().toISOString();
  console.warn(`⚠️ [${time}] [${scope}] ${message}${formatExtra(extra)}`);
}

export function logError(scope, message, extra = null) {
  const time = new Date().toISOString();
  console.error(`❌ [${time}] [${scope}] ${message}${formatExtra(extra)}`);
}
