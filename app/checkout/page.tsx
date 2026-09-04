import type { Metadata } from 'next'; import { SitePage } from '@/components/storefront';
export const metadata:Metadata={title:'Checkout',robots:{index:false,follow:false}};
export default function Page(){return <SitePage kind="checkout"/>}
