import { SitePage } from '@/components/storefront';
export default async function PolicyPage({params}:{params:Promise<{slug:string}>}){const {slug}=await params;return <SitePage kind="policy" param={slug}/>}
