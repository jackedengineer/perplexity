import Lab from './preview';
export default async function Page({searchParams}:{searchParams:Promise<{saved?:string}>}){return <Lab saved={(await searchParams).saved==='1'}/>;}
