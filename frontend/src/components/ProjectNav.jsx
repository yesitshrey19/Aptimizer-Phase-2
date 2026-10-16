import { useState } from "react";
import { Menu } from "lucide-react";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Brand } from "@/components/Brand";

/**
 * Project navigation — one trigger per stage, each opening a vertical panel of its modules
 * with a one-line description; the active module is named beside them so the bar always
 * says where the user is. Below `lg` every stage's list opens in one sheet.
 */

// One line each, describing what the module decides rather than restating its name.
const DESCRIPTIONS = {
  plot: "Boundary, area, setbacks, development controls and the optimised site layout",
  gis: "Terrain, flood, seismic, wind, sun path, solar potential and site suitability",
  township: "Macro-parcel master zoning, mixed-use planning and circulation hierarchy",
  reports: "Ready-to-export PDF reports for every site module, singly or as one set",
  planning: "Tower massing, building shapes, 5BHK penthouses, unit mix, and society amenities",
  "autonomous-studio": "Quick-start generative layouts from plot area and budget tier",
  parking: "Required and provided bays, basement layouts, and vehicular circulation",
  studio: "Apartment planning, AI floor plans, facade, landscape, and parking generation",
  "3d": "Interactive 3D massing model, floor stacking, and structural bays",
  bim: "DXF, DWG, and IFC import/export for AutoCAD and Revit interop",
};

function ModuleLink({ item, active, onPick, onDone }) {
  const [key, label, Icon] = item;
  const isActive = active === key;
  return (
    <li>
      <button
        type="button"
        onClick={() => { onPick(key); onDone?.(); }}
        data-testid={`nav-module-${key}`}
        aria-current={isActive ? "page" : undefined}
        className={`flex w-full select-none items-start gap-2.5 rounded-md px-3 py-2.5 text-left outline-none transition-colors hover:bg-slate-100 hover:text-slate-900 ${
          isActive ? "bg-slate-100 font-medium text-slate-900" : "text-slate-700"
        }`}
      >
        <Icon className={`size-4 shrink-0 mt-0.5 ${isActive ? "text-blue-600" : "text-slate-400"}`} />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-slate-900 leading-snug">{label}</div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 whitespace-normal break-words">
            {DESCRIPTIONS[key] || ""}
          </p>
        </div>
      </button>
    </li>
  );
}

export function ProjectNav({ groups, active, onPick }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  // Controlled, so picking a module closes the dropdown -- a button inside it does not
  // close a Radix navigation menu on its own and the open menu covered the module.
  const [menu, setMenu] = useState("");
  // One trigger per stage, numbered in catalogue order. The stage holding the open module
  // carries the dot, and its module is named beside the triggers.
  const stages = groups.map(([gkey, glabel, items = []], i) => ({ gkey, glabel, items, n: i + 1 }));
  const current = stages.flatMap((g) => g.items).find((m) => m[0] === active);
  const activeStage = stages.find((g) => g.items.some((m) => m[0] === active)) || stages[0];
  const CurrentIcon = current?.[2];

  const crumb = current && (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-white" data-testid="nav-active-module">
      <span className="text-slate-500">/</span>
      {CurrentIcon && <CurrentIcon className="h-3.5 w-3.5 shrink-0 text-blue-400" />}
      <span className="truncate font-medium">{current[1]}</span>
    </span>
  );

  return (
    <nav className="sticky top-0 z-20 border-b border-slate-800 bg-slate-900 text-slate-300" data-testid="module-nav">
      {/* Desktop */}
      <div className="hidden items-center gap-2 px-2 lg:flex">
        <NavigationMenu value={menu} onValueChange={setMenu}>
          <NavigationMenuList>
            {stages.map(({ gkey, glabel, items, n }) => (
              <NavigationMenuItem key={gkey} value={gkey}>
                <NavigationMenuTrigger
                  data-testid={`nav-group-${gkey}`}
                  className="h-11 gap-1.5 rounded-none bg-transparent text-[11px] uppercase tracking-wide font-bold text-white hover:bg-slate-800 hover:text-white focus:bg-slate-800 focus:text-white data-[state=open]:bg-slate-800 data-[state=open]:text-white"
                >
                  <span className="font-medium text-slate-400">Stage {n} ·</span> {glabel}
                  {activeStage?.gkey === gkey && <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-blue-400" />}
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="flex flex-col p-1.5 gap-0.5 w-80 sm:w-[380px]">
                    {items.map((item) => (
                      <ModuleLink key={item[0]} item={item} active={active} onPick={onPick} onDone={() => setMenu("")} />
                    ))}
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
            ))}
          </NavigationMenuList>
        </NavigationMenu>
        {crumb}
        <div className="flex-1" />
      </div>

      {/* Mobile / tablet */}
      <div className="flex items-center justify-between gap-2 px-2 py-2 lg:hidden">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-400">
          Stage {activeStage?.n} · <span className="font-bold text-white">{activeStage?.glabel}</span>
          <span className="normal-case tracking-normal">{crumb}</span>
        </span>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" data-testid="nav-open-sheet" aria-label="Open menu">
              <Menu className="size-4" />
            </Button>
          </SheetTrigger>
          <SheetContent className="overflow-y-auto">
            <SheetHeader>
              <SheetTitle>
                <Brand testid="project-nav-sheet-brand" markClass="h-7 w-auto" wordClass="text-[14px]" />
              </SheetTitle>
            </SheetHeader>
            {stages.map(({ gkey, glabel, items, n }) => (
              <div key={gkey}>
                <p className="mt-6 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Stage {n} · {glabel}</p>
                <ul className="mt-2 flex flex-col gap-1">
                  {items.map((item) => (
                    <ModuleLink key={item[0]} item={item} active={active} onPick={onPick} onDone={() => setSheetOpen(false)} />
                  ))}
                </ul>
              </div>
            ))}
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}

export default ProjectNav;
