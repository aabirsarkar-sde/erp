import { Sparkle } from "@/components/workspace/ai-ui";
import { IconHome, IconTicket, IconBuilding, IconCog, IconChart, IconFunnel, IconCheck, IconDoc, IconCalendar, IconChat, IconFolder, IconTrend, IconFactory, IconInbox } from "@/components/ui/icons";

export type Item = { href: string; label: string; icon: (p: { className?: string }) => React.ReactElement; exact?: boolean; badge?: "chat" };
const NAV: { title?: string; items: Item[]; admin?: boolean; dept?: "crm" | "hd" }[] = [
  { items: [{ href: "/", label: "Dashboard", icon: IconHome, exact: true }, { href: "/ask", label: "Ask AI", icon: Sparkle }, { href: "/insights", label: "Insights", icon: IconTrend }] },
  { title: "Helpdesk (O&M)", dept: "hd", items: [{ href: "/helpdesk", label: "Helpdesk dashboard", icon: IconTrend }, { href: "/tickets", label: "Tickets", icon: IconTicket }, { href: "/reports", label: "SLA reports", icon: IconChart }] },
  { title: "Sales & Marketing", dept: "crm", items: [{ href: "/crm/leads", label: "Leads", icon: IconInbox }, { href: "/crm", label: "Opportunities", icon: IconFunnel }, { href: "/activities", label: "Activities & visits", icon: IconCheck }, { href: "/quotations", label: "Quotations", icon: IconDoc }, { href: "/sales-reports", label: "Sales reports", icon: IconChart }] },
  { title: "Workspace", items: [{ href: "/calendar", label: "Calendar", icon: IconCalendar }, { href: "/discuss", label: "Discuss", icon: IconChat, badge: "chat" }, { href: "/documents", label: "Documents", icon: IconFolder }] },
  { title: "Directory", items: [{ href: "/customers", label: "Customers", icon: IconBuilding }] },
  { title: "O&M sites", dept: "hd", items: [{ href: "/plants", label: "Plants", icon: IconFactory }] },
  { admin: true, items: [{ href: "/settings", label: "Settings", icon: IconCog }] },
];


export type Access = { isAdmin: boolean; crm: boolean; hd: boolean };
export const visibleNav = (a: Access) => NAV.filter((g) => (!g.admin || a.isAdmin) && (!g.dept || (g.dept === "crm" ? a.crm : a.hd)));
