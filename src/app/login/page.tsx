import { LoginForm } from "@/components/ui/login-form";
import { BRAND } from "@/lib/core/edition";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return <LoginForm name={BRAND.name} tagline={`${BRAND.tagline} · Zero Discharge Systems Pvt. Ltd.`} />;
}
