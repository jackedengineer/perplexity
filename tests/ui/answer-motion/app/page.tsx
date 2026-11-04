import Lab from './preview';
export default async function Page({searchParams}:{searchParams:Promise<{saved?:string;motion?:string}>}){
 const params=await searchParams;
 return <>{params.motion==='slow'&&<style>{`@media(prefers-reduced-motion:no-preference){.research-shell .research-sidebar,.research-shell .sidebar-reveal{transition-duration:2.2s!important}.research-shell .answer-sources,.research-shell .mobile-sources-dialog,.research-shell .mobile-navigation,.research-shell .mobile-navigation::backdrop,.research-shell .mobile-sources-dialog::backdrop{transition-duration:1.8s!important}}`}</style>}<Lab saved={params.saved==='1'}/></>;
}
