import Link from "next/link";
export default function NotFound() {
  return <div className="py-20 text-center"><p className="font-medium">Not found</p><Link href="/" className="text-sm text-brand-700">Back to dashboard</Link></div>;
}
