import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { DecorIcon } from "@/components/decor-icon";
import { AppBreadcrumbs } from "@/components/app-breadcrumbs";
import { navGroups } from "@/components/app-shared";
import { CustomSidebarTrigger } from "@/components/custom-sidebar-trigger";
import { NavUser } from "@/components/nav-user";
import { SunIcon, MoonIcon } from "lucide-react";
import { useDarkMode } from "@/hooks/use-dark-mode";
import { useEffect, useState } from "react";
import { getView } from "@/App";

export function AppHeader() {
	const { dark, toggle } = useDarkMode();

	// Reactive breadcrumb that updates on hash change
	const [currentView, setCurrentView] = useState(getView);
	useEffect(() => {
		const handler = () => setCurrentView(getView());
		window.addEventListener("hashchange", handler);
		return () => window.removeEventListener("hashchange", handler);
	}, []);

	const activeItem = navGroups
		.flatMap(g => g.items)
		.find(item => item.path === `#/${currentView}`);

	return (
		<header
			className={cn(
				"sticky top-0 z-50 flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4 md:px-6",
				"bg-background/95 backdrop-blur-sm supports-backdrop-filter:bg-background/50"
			)}
		>
			<DecorIcon className="hidden md:block" position="bottom-left" />
			<div className="flex items-center gap-3">
				<CustomSidebarTrigger />
				<Separator
					className="mr-2 h-4 data-[orientation=vertical]:self-center"
					orientation="vertical"
				/>
				<AppBreadcrumbs page={activeItem ?? null} />
			</div>
			<div className="flex items-center gap-3">
				<Button
					aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
					size="icon-sm"
					variant="outline"
					onClick={toggle}
				>
					{dark ? <SunIcon /> : <MoonIcon />}
				</Button>
				<Separator
					className="h-4 data-[orientation=vertical]:self-center"
					orientation="vertical"
				/>
				<NavUser />
			</div>
		</header>
	);
}
