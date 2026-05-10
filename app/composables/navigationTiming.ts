// Window during which screencast frames are held back (and the browser
// chrome's URL bar update is deferred) after a `page_navigated` event.
// Just long enough to absorb chromium's blank/partial-paint frames between
// commit and first paint, so the user perceives a clean old-page → new-page
// swap instead of a flicker through a white intermediate state.
export const NAVIGATION_FREEZE_MS = 350
