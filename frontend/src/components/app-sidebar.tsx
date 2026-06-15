"use client";

import { cn } from "@/lib/utils";
import { LogoIcon } from "@/components/logo";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { footerNavLinks, navGroups } from "@/components/app-shared";
import { LatestChange } from "@/components/latest-change";
import { NavGroup } from "@/components/nav-group";
import type { View } from "@/App";

const VIEW_HASH: Record<View, string> = {
	all: "#/all",
	logs: "#/logs",
	metrics: "#/metrics",
	traces: "#/traces",
}

export function AppSidebar({ currentView }: { currentView?: View }) {
	// Build nav groups with dynamic isActive based on currentView
	const activeHash = currentView ? VIEW_HASH[currentView] : "#/all"
	const dynamicNavGroups = navGroups.map(group => ({
		...group,
		items: group.items.map(item => ({
			...item,
			isActive: item.path === activeHash,
		})),
	}))

	return (
		<Sidebar
			className={cn(
				"*:data-[slot=sidebar-inner]:bg-background",
				"*:data-[slot=sidebar-inner]:dark:bg-[radial-gradient(60%_18%_at_10%_0%,--theme(--color-foreground/.08),transparent)]",
				"**:data-[slot=sidebar-menu-button]:[&>span]:text-foreground/75"
			)}
			collapsible="icon"
			variant="sidebar"
		>
			<SidebarHeader className="h-14 justify-center border-b px-2">
				<SidebarMenuButton render={<a href="#/all" />}><LogoIcon /><span className="font-medium text-foreground!">OTel Analyzer</span></SidebarMenuButton>
			</SidebarHeader>
			<SidebarContent>
				{dynamicNavGroups.map((group, index) => (
					<NavGroup key={`sidebar-group-${index}`} {...group} />
				))}
			</SidebarContent>
			<SidebarFooter className="gap-0 p-0">
				<LatestChange />
				<SidebarMenu className="border-t p-2">
					{footerNavLinks.map((item) => (
						<SidebarMenuItem key={item.title}>
							<SidebarMenuButton className="text-muted-foreground" isActive={item.isActive} size="sm" render={<a href={item.path} />}>{item.icon}<span>{item.title}</span></SidebarMenuButton>
						</SidebarMenuItem>
					))}
				</SidebarMenu>
				<div className="px-4 pt-4 pb-2 transition-opacity group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:opacity-0">
					<p className="text-nowrap text-[9px] text-muted-foreground">
						© {new Date().getFullYear()} OTel Analyzer
					</p>
				</div>
			</SidebarFooter>
		</Sidebar>
	);
}
