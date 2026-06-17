/**
 * Minimal structural type for calling Postgres RPCs on the Supabase client
 * without parameterizing it with the full generated `Database` generic.
 * Use as `supabase as unknown as RpcCapable` at the call site.
 */
export type RpcCapable = {
  rpc: (
    name: string,
    args: Record<string, string>,
  ) => Promise<{ data: unknown, error: { message: string } | null }>
}
