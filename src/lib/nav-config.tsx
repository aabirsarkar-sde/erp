import { Sparkle } from "@/components/ai-ui";
import { IconHome, IconTicket, IconBuilding, IconCog, IconChart, IconFunnel, IconCheck, IconDoc, IconCalendar, IconChat, IconFolder, IconTrend, IconFactory } from "@/components/icons";

export type Item = { href: string; label: string; icon: (p: { className?: string }) => React.ReactElement; exact?: boolean; badge?: "chat" };
export const NAV: { title?: string; items: Item[]; admin?: boolean }[] = [
  { items: [{ href: "/", label: "Dashboard", icon: IconHome, exact: true }, { href: "/ask", label: "Ask AI", icon: Sparkle }, { href: "/insights", label: "Insights", icon: IconTrend }] },
  { title: "Helpdesk", items: [{ href: "/helpdesk", label: "Helpdesk dashboard", icon: IconTrend }, { href: "/tickets", label: "Tickets", icon: IconTicket }, { href: "/reports", label: "SLA reports", icon: IconChart }] },
  { title: "Sales", items: [{ href: "/crm", label: "Pipeline", icon: IconFunnel }, { href: "/activities", label: "Activities", icon: IconCheck }, { href: "/quotations", label: "Quotations", icon: IconDoc }] },
  { title: "Workspace", items: [{ href: "/calendar", label: "Calendar", icon: IconCalendar }, { href: "/discuss", label: "Discuss", icon: IconChat, badge: "chat" }, { href: "/documents", label: "Documents", icon: IconFolder }] },
  { title: "Directory", items: [{ href: "/customers", label: "Customers", icon: IconBuilding }, { href: "/plants", label: "Plants", icon: IconFactory }] },
  { admin: true, items: [{ href: "/settings", label: "Settings", icon: IconCog }] },
];

