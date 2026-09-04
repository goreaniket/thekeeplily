import type { Metadata } from 'next';
import { SitePage } from '@/components/storefront';
export const metadata:Metadata={title:'Shop Handmade Gifts',description:'Browse clay charms, candles, phone accessories, cards, wax sachets and personalised gifts from TheKeeplily Co.'};
export default function ShopPage(){ return <SitePage kind="shop"/>; }
