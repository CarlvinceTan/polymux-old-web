import { requireMaintainer } from '~~/server/utils/security/requireMaintainer'
import { ADMIN_ENV_COOKIE, adminEnvAvailable, availableAdminEnvs, type AdminEnv } from '~~/server/utils/admin/adminEnv'

// POST /api/admin/env  { env: 'dev' | 'prod' }
//
// Sets the maintainer's admin data environment (the dev/prod dropdown). Stored
// in an http-only cookie that adminServiceClient() reads on every admin request.
// Rejects 'prod' unless its credentials are configured.

export default defineEventHandler(async (event) => {
  await requireMaintainer(event)
  const body = await readBody<{ env?: string }>(event)
  const env: AdminEnv = body?.env === 'prod' ? 'prod' : 'dev'
  if (!adminEnvAvailable(env)) {
    throw createError({ statusCode: 400, statusMessage: `Environment '${env}' is not configured.` })
  }
  setCookie(event, ADMIN_ENV_COOKIE, env, {
    httpOnly: true,
    secure: !import.meta.dev,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
  return { env, available_envs: availableAdminEnvs() }
})
