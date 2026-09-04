declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    GOOGLE_SHEETS_API_URL?: string;
    PAYMENT_PROVIDER?: 'razorpay' | 'cashfree';
    RAZORPAY_KEY_ID?: string;
    RAZORPAY_KEY_SECRET?: string;
    CASHFREE_APP_ID?: string;
    CASHFREE_SECRET_KEY?: string;
  }
}
