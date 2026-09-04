import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://thekeeplily-co.safe-tide-8904.chatgpt.site'),
  title: { default:'TheKeeplily Co. — Little gifts, big feelings.', template:'%s · TheKeeplily Co.' },
  description: 'Cute, thoughtful handmade gifts from Vapi. Clay charms, candles, phone accessories, cards, wax sachets and custom keepsakes.',
  keywords: ['handmade gifts India','personalised gifts Vapi','clay charms','candles','phone charms','wax sachets'],
  openGraph: { title:'TheKeeplily Co.', description:'Little gifts, big feelings. ♡ Handmade with love in Vapi.', type:'website', images:[{url:'/og.png',width:1536,height:1024,alt:'TheKeeplily Co. — Little gifts, big feelings.'}] },
  twitter: { card:'summary_large_image', title:'TheKeeplily Co.', description:'Little gifts, big feelings. ♡', images:['/og.png'] },
  robots:{index:true,follow:true},
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
