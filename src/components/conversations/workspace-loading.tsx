/** Server-rendered placeholder; keeps navigation instant without a client bundle. */
export function WorkspaceLoading({fullPage=false}:{fullPage?:boolean}) {
 return <main id="main" className={`workspace-loading${fullPage?' workspace-loading-full':''}`} role="status" aria-label="Loading workspace" aria-busy="true">
  {fullPage&&<aside className="loading-sidebar" aria-hidden="true"><i/><i/><i/></aside>}
  <div className="loading-workspace" aria-hidden="true">
   <div className="loading-topbar"><i/></div>
   <div className="loading-column"><div className="loading-heading"/><div className="loading-line"/><div className="loading-line loading-line-short"/><div className="loading-composer"><i/><i/></div></div>
  </div>
 </main>;
}
