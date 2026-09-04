import type { Metadata } from 'next'; import { SitePage } from '@/components/storefront';
export const metadata:Metadata={title:'About',description:'Handmade gifts with love and care, made to make special moments more memorable.'};
export default function Page(){return <SitePage kind="about"/>}
