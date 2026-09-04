import type { Metadata } from 'next'; import { SitePage } from '@/components/storefront';
export const metadata:Metadata={title:'Custom Gifts',description:'Share your idea for a thoughtful, personalised handmade keepsake.'};
export default function Page(){return <SitePage kind="custom"/>}
