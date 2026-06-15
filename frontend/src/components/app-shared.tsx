import type { ReactNode } from "react"
import { LayoutGridIcon, ScrollTextIcon, BarChart3Icon, GitBranchIcon, HelpCircleIcon, BookOpenIcon } from "lucide-react"

export type SidebarNavItem = {
  title: string
  path?: string
  icon?: ReactNode
  isActive?: boolean
  subItems?: SidebarNavItem[]
}

export type SidebarNavGroup = {
  label?: string
  items: SidebarNavItem[]
}

export const navGroups: SidebarNavGroup[] = [
  {
    label: "Signals",
    items: [
      {
        title: "All",
        path: "#/all",
        icon: <LayoutGridIcon />,
        isActive: true,
      },
      {
        title: "Logs",
        path: "#/logs",
        icon: <ScrollTextIcon />,
      },
      {
        title: "Metrics",
        path: "#/metrics",
        icon: <BarChart3Icon />,
      },
      {
        title: "Traces",
        path: "#/traces",
        icon: <GitBranchIcon />,
      },
    ],
  },
]

export const footerNavLinks: SidebarNavItem[] = [
  {
    title: "Help",
    path: "#/help",
    icon: <HelpCircleIcon />,
  },
  {
    title: "Documentation",
    path: "#/docs",
    icon: <BookOpenIcon />,
  },
]

export const navLinks: SidebarNavItem[] = [
  ...navGroups.flatMap(g => g.items.flatMap(item => item.subItems?.length ? [item, ...item.subItems] : [item])),
  ...footerNavLinks,
]
