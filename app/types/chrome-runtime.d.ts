/**
 * Minimal MV3-extension surface the polymux web app uses to talk to the
 * polymux Chrome extension. We don't pull in `@types/chrome` because the
 * web app only touches a tiny slice of the API and the full package is
 * 100k+ lines of declarations.
 *
 * Keep these definitions intentionally loose on the response shapes so the
 * extension can evolve its message kinds without breaking the web build —
 * runtime code narrows via property checks before reading anything.
 */

export interface PolymuxExtensionAck {
  ok: boolean
  error?: string
  /** Free-form response payload. The shape varies by message kind (ping,
   *  pair_from_website, etc.). Consumers must narrow before reading. */
  result?: Record<string, unknown>
}

export interface PolymuxChromePort {
  name: string
  postMessage(message: unknown): void
  disconnect(): void
  onMessage: {
    addListener(listener: (message: unknown) => void): void
    removeListener(listener: (message: unknown) => void): void
  }
  onDisconnect: {
    addListener(listener: () => void): void
    removeListener(listener: () => void): void
  }
}

export interface PolymuxChromeRuntime {
  sendMessage?: (
    extensionId: string,
    message: unknown,
    callback?: (response: PolymuxExtensionAck) => void,
  ) => void
  connect?: (extensionId: string, info?: { name?: string }) => PolymuxChromePort
  lastError?: { message?: string }
  id?: string
}

declare global {
  interface Window {
    chrome?: {
      runtime?: PolymuxChromeRuntime
    }
  }
}
