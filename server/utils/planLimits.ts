const MB = 1024 * 1024
const GB = 1024 * MB
const TB = 1024 * GB

export const PLAN_BROWSER_AGENT_CAPS: Record<string, number> = {
  free: 2,
  pro: 8,
  max: 20,
  enterprise: 50,
}

export const PLAN_STORAGE_BYTES: Record<string, number> = {
  free: 5 * GB,
  pro: 100 * GB,
  max: 1 * TB,
  enterprise: 10 * TB,
}

export const PLAN_FILE_BYTES: Record<string, number> = {
  free: 100 * MB,
  pro: 5 * GB,
  max: 20 * GB,
  enterprise: 100 * GB,
}

export const PLAN_PULL_FOLDER_BYTES: Record<string, number> = {
  free: 500 * MB,
  pro: 10 * GB,
  max: 100 * GB,
  enterprise: 1 * TB,
}

export const PLAN_ARTIFACT_BYTES: Record<string, number> = {
  free: 2 * GB,
  pro: 20 * GB,
  max: 100 * GB,
  enterprise: 1 * TB,
}

export function browserAgentCap(plan: string): number {
  return PLAN_BROWSER_AGENT_CAPS[plan] ?? PLAN_BROWSER_AGENT_CAPS.free!
}

export function storageCap(plan: string): number {
  return PLAN_STORAGE_BYTES[plan] ?? PLAN_STORAGE_BYTES.free!
}

export function fileCap(plan: string): number {
  return PLAN_FILE_BYTES[plan] ?? PLAN_FILE_BYTES.free!
}

export function pullFolderCap(plan: string): number {
  return PLAN_PULL_FOLDER_BYTES[plan] ?? PLAN_PULL_FOLDER_BYTES.free!
}

export function artifactCap(plan: string): number {
  return PLAN_ARTIFACT_BYTES[plan] ?? PLAN_ARTIFACT_BYTES.free!
}
