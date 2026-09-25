import { Sparkle } from "@/components/ai-ui";
import { IconHome, IconTicket, IconBuilding, IconCog, IconChart, IconFunnel, IconCheck, IconDoc } from "@/components/icons";

export type Item = { href: string; label: string; icon: (p: { className?: string }) => React.ReactElement; exact?: boolean };
export const NAV: { title?: string; items: Item[]; admin?: boolean }[] = [
  { items: [{ href: "/", label: "Dashboard", icon: IconHome, exact: true }, { href: "/ask", label: "Ask AI", icon: Sparkle }] },
  { title: "Helpdesk", items: [{ href: "/tickets", label: "Tickets", icon: IconTicket }, { href: "/reports", label: "Reports", icon: IconChart }] },
  { title: "Sales", items: [{ href: "/crm", label: "Pipeline", icon: IconFunnel }, { href: "/activities", label: "Activities", icon: IconCheck }, { href: "/quotations", label: "Quotations", icon: IconDoc }] },
  { title: "Directory", items: [{ href: "/customers", label: "Customers", icon: IconBuilding }] },
  { admin: true, items: [{ href: "/settings", label: "Settings", icon: IconCog }] },
];

