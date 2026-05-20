// Generates the JS source that gets injected into every layout iframe's
// srcdoc. The script exposes `window.polymux` with postMessage-backed RPC
// methods that talk to the parent (CustomLayoutFrame.vue). The parent runs
// the actual fetch with the user's authenticated session and posts the
// result back. The iframe never sees cookies or tokens directly.
//
// Method surface (v1):
//   polymux.workspace.get(): Promise<{ id, name }>
//   polymux.files.list({ folder_id? }): Promise<File[]>
//   polymux.workflows.list(): Promise<Workflow[]>
//   polymux.artifacts.list({ workflow_id }): Promise<Artifact[]>
//
// The shape returned by each list method mirrors the corresponding
// /api/... endpoint. We deliberately keep this list short and read-only —
// future mutations should go through carefully-scoped RPC methods, not a
// general "fetch any path" escape hatch.

interface BuildOpts {
  workspaceId: string
  workspaceName: string
}

export function buildLayoutSdkSource(opts: BuildOpts): string {
  // The injected script is a self-contained IIFE. Workspace id is baked in
  // synchronously so layout authors can read `polymux.workspaceId` without
  // an RPC round-trip on init.
  const wsId = JSON.stringify(opts.workspaceId)
  const wsName = JSON.stringify(opts.workspaceName)
  return `;(function(){
  var nextId = 1;
  var pending = new Map();
  window.addEventListener('message', function (evt) {
    var data = evt && evt.data;
    if (!data || data.__polymux !== 'rpc:response') return;
    var p = pending.get(data.requestId);
    if (!p) return;
    pending.delete(data.requestId);
    if (data.error) p.reject(new Error(data.error));
    else p.resolve(data.result);
  });
  function rpc(method, params) {
    return new Promise(function (resolve, reject) {
      var id = nextId++;
      pending.set(id, { resolve: resolve, reject: reject });
      window.parent.postMessage({ __polymux: 'rpc', requestId: id, method: method, params: params || null }, '*');
    });
  }
  window.polymux = {
    workspaceId: ${wsId},
    workspaceName: ${wsName},
    workspace: {
      get: function () { return rpc('workspace.get'); }
    },
    files: {
      list: function (params) { return rpc('files.list', params || {}); }
    },
    workflows: {
      list: function () { return rpc('workflows.list'); }
    },
    artifacts: {
      list: function (params) { return rpc('artifacts.list', params || {}); }
    }
  };
})();`
}
