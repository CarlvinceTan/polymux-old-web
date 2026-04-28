// Teach devalue how to (de)serialize Error instances. Without this, any
// `console.error('msg', err)` on the server during an SSR render crashes
// Nuxt's dev-server-logs forwarder with:
//   "Failed to stringify dev server logs. Cannot stringify arbitrary non-POJOs"
// because devalue ships with reducers for VNode + URL only.
export default definePayloadPlugin(() => {
  definePayloadReducer('Error', (data) =>
    data instanceof Error
      ? { name: data.name, message: data.message, stack: data.stack }
      : undefined,
  )
  definePayloadReviver('Error', (data) => {
    const err = new Error(data.message)
    err.name = data.name
    if (data.stack) err.stack = data.stack
    return err
  })
})
