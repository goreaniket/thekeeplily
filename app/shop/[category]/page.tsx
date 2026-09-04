import { SitePage } from '@/components/storefront';
export default async function CategoryPage({params}:{params:Promise<{category:string}>}){ const {category}=await params; return <SitePage kind="shop" param={category}/>; }
