# Build spec: UI Shell (Header + vertical SideNav + slicers)

**How to read this file:** Implement exactly these Carbon React v11 components and props. Do not substitute a custom navbar. If something is not listed, do not add it.

```yaml
screen_id: app-shell
framework: react
design_system: carbon
package: "@carbon/react"
icons_package: "@carbon/icons-react"
styles: "@carbon/styles/css/styles.css"
theme: g90
interactive_color: IBM Blue 60 ($button-primary / $link-primary)
carbon_version: v11
layout_axis: vertical
primary_viewport: "MacBook Chrome 1440x900"
min_viewport: "1280x800"
horizontal_scroll: forbidden
landing_route: /
landing_pattern: birds-eye dashboard
```

---

## 1. Chosen theme (professional)

Use Carbon **Gray 90 (`g90`)** for the whole product shell and landing dashboard.

| Choice | Value | Why |
| --- | --- | --- |
| Theme | `g90` | Professional operations console; readable on a bright MacBook display; less harsh than `g100` |
| Interactive | IBM Blue 60 (theme default) | Standard Carbon primary; do not introduce a custom brand hex |
| Layering | `$background`, `$layer-01`, `$layer-02` | Cards and tables sit one layer above the page |
| Status | Carbon support tokens only | `$support-error`, `$support-warning`, `$support-success`, `$support-info` |

```tsx
<Theme theme="g90">{/* app */}</Theme>
```

Do not use White or g10 for planner desktops. Do not override `$button-primary` with a custom color.

---

## 2. Layout principle: vertical, not horizontal

| Do | Do not |
| --- | --- |
| All product navigation in a **left vertical SideNav** | `HeaderNavigation` / horizontal top tabs for IA |
| All analysis filters in a **vertical Slicer menu** | A long horizontal filter toolbar as the primary control |
| Landing page **stacks** KPI → charts → attention list | A wide Gantt as the first thing on `/` |
| Fit **one MacBook Chrome window** with no horizontal scroll | Multi-column boards that require sideways panning |

Header exists only for product name + global actions (alerts, help, account). It is not a navigation bar.

---

## 3. Target viewport (MacBook Chrome)

Design and accept against Google Chrome on macOS.

| Profile | CSS pixels | Use |
| --- | --- | --- |
| Primary | 1440 × 900 | Default design frame |
| Minimum | 1280 × 800 | Must not clip or scroll sideways |
| Height budget | 900 − 48 header = 852 | Landing dashboard first screen |

**Hard rules**

- `overflow-x: hidden` on `body` and shell. No page-level horizontal scrollbar.
- SideNav + slicer column + dashboard must equal the viewport width at 1280 and 1440.
- First dashboard screen (KPIs + two analysis modules) must be visible at 900 height without horizontal cut-off.
- Vertical scroll is allowed below the first dashboard band.
- Test at Chrome 100% zoom. Do not require 80% zoom to see the layout.

**Width math at 1440**

```
1440
- 256  fixed SideNav (expanded labels)
- 256  slicer column
= 928  dashboard canvas
```

**Width math at 1280**

```
1280
- 256  SideNav
- 224  slicer column (compact)
= 800  dashboard canvas
```

Below 1280 (not the MacBook target): collapse slicers into a `HeaderPanel` and keep SideNav as overlay. Do not make that the default desktop.

---

## 4. Component tree

```
Theme(theme="g90")
└── HeaderContainer
    └── render({ isSideNavExpanded, onClickSideNavExpand })
        ├── Header                         // 48px, no HeaderNavigation
        │   ├── SkipToContent
        │   ├── HeaderMenuButton           // only used below 1280
        │   ├── HeaderName
        │   └── HeaderGlobalBar
        │       ├── HeaderGlobalAction     alerts
        │       ├── HeaderGlobalAction     help
        │       └── HeaderGlobalAction     user
        ├── SideNav                        // vertical IA + slicer menus
        │   └── SideNavItems
        │       ├── SideNavLink × routes
        │       ├── SideNavDivider
        │       ├── SideNavMenu × slicers
        │       └── SideNavLink            reset slicers
        └── Content#main-content
            └── Landing dashboard | other routes
```

On the MacBook desktop target (≥1280): SideNav is **always expanded** so labels and slicer menus are visible. `HeaderMenuButton` may render but is not the primary way to reach nav.

---

## 5. Props

### Theme
| Prop | Value |
| --- | --- |
| theme | `g90` |

### Header
| Prop | Value |
| --- | --- |
| aria-label | `Assignment` |

### SkipToContent
| Prop | Value |
| --- | --- |
| href | `#main-content` |

### HeaderMenuButton
| Prop | Value |
| --- | --- |
| aria-label | `Open menu` / `Close menu` |
| onClick | `onClickSideNavExpand` |
| isActive | `isSideNavExpanded` |
| isCollapsible | `true` |

Hidden with CSS only below the MacBook target if needed. Do not remove from the tree.

### HeaderName
| Prop | Value |
| --- | --- |
| href | `/` |
| prefix | `Tech Ops` |
| children | `Assignment` |

### HeaderGlobalBar
| id | icon | aria-label | behavior |
| --- | --- | --- | --- |
| alerts | `Notification` | `Alerts` | route `/alerts`; badge = unread count |
| help | `Help` | `Help` | no-op v1 |
| user | `UserAvatar` | `Account` | no-op v1 |

Last two: `tooltipAlignment="end"`.

### SideNav (MacBook default)
| Prop | Value | Why |
| --- | --- | --- |
| aria-label | `Side navigation` | a11y |
| isRail | `false` | vertical labeled menu, not icon rail |
| isChildOfHeader | `true` | under 48px header |
| isFixedNav | `true` | persistent vertical column; no overlay eating canvas |
| isPersistent | `true` | stay visible on desktop |
| defaultExpanded | `true` | labels + slicers always readable |
| expanded | `true` on ≥1280 | |
| href | `#main-content` | |

Do not use `isRail` on the MacBook layout. Rail is icon-only and hides slicer names.

### SideNavLink
| Prop | Value |
| --- | --- |
| renderIcon | Carbon icon |
| href | nav table |
| aria-current | `page` when selected |
| large | `false` |

### SideNavMenu (slicers)
| Prop | Value |
| --- | --- |
| title | slicer name |
| defaultExpanded | `false` (open one at a time is fine) |
| renderIcon | slicer icon |

Each `SideNavMenuItem` is one slicer value. Selecting it applies that slicer globally.

---

## 6. Measurements

| Element | Size |
| --- | --- |
| Header | 48px tall, full viewport width, sticky |
| SideNav desktop | 256px wide, `100vh - 48px` tall, vertical scroll inside nav if needed |
| Slicer menus | inside SideNav, below routes |
| Content | remaining width; no max-width wrapper |
| Dashboard page pad | `$spacing-05` (16px) |
| KPI tile min height | 88px |
| Forbidden | any shell wider than the viewport |

Tokens come from `g90`. Do not hard-code hex.

---

## 7. Vertical navigation inventory

Order is binding. No horizontal equivalent.

| # | label | href | icon | type |
| --- | --- | --- | --- | --- |
| 1 | Control tower | `/` | `Dashboard` | route (landing) |
| 2 | Planner | `/planner` | `Calendar` | route |
| 3 | Workforce | `/workforce` | `UserMultiple` | route |
| 4 | Alerts | `/alerts` | `WarningAlt` | route |
| 5 | Horizon | `/horizon` | `Events` | route |
| 6 | Reports | `/reports` | `ChartLine` | route |
| — | `SideNavDivider` | | | |
| S1–S5 | slicer menus | — | see §8 | global filters |
| 7 | Reset slicers | `#reset-slicers` | `FilterRemove` | action |
| — | `SideNavDivider` | | | |
| 8 | Admin | `/admin` | `Settings` | route |

Active route: `aria-current="page"`. `/planner/:id` selects Planner.

---

## 8. Slicer menus (interact with every view)

Slicers are **global UI state**. Changing one reslices the landing dashboard and every other desktop route (planner list, workforce, alerts, horizon, reports).

Put them in the SideNav as vertical `SideNavMenu` groups — not a horizontal toolbar.

| Slicer id | Menu title | icon | Control values (v1) | Default | Multi |
| --- | --- | --- | --- | --- | --- |
| station | Station | `Location` | HEL, FRA, MUC, All stations | All stations | single |
| window | Time window | `Time` | Now–12h, 24h, 72h, 14d | Now–12h | single |
| fleet | Fleet | `Aircraft` | A320 family, A330, B737, All fleets | All fleets | multi |
| shift | Shift | `UserActivity` | Day, Evening, Night, All shifts | All shifts | single |
| status | Status | `ConditionPoint` | At risk, Delayed, Blocked, In progress, On track, All | All | multi |

### Slicer behavior

| Event | Result |
| --- | --- |
| Open a slicer menu | show values as `SideNavMenuItem` |
| Click a value | apply immediately; close is optional |
| Active value | check / selected style on the item; menu title may show count |
| Reset slicers | all five return to defaults; dashboard reloads aggregates |
| Route change | slicers persist |
| Refresh | persist in session storage |

Applied slicers must also be visible in the dashboard header as `Tag` (filter/closable) so the user can see the slice without opening the menus. Closing a Tag clears that slicer.

Do not duplicate these five controls as a horizontal `TableToolbar` on the landing page. Search for a tail/flight may still live on the attention table only.

---

## 9. Landing UI = bird’s-eye dashboard

Route `/` is **Control tower dashboard**, not an empty shell and not a full-width Gantt.

Vertical page bands (top → bottom). Each band is full width of the canvas.

```
Band A  Page header + applied slicer Tags + sync age
Band B  KPI tiles (2×2 at 1280, 4-across at 1440)
Band C  Analysis pair (status mix | capacity) stacked at 1280, two-up at 1440
Band D  Attention list (turnarounds that need action)
Band E  Optional compact timeline  (below fold; not the hero)
```

### Band A — header
- Title: `Control tower` (`$heading-03`)
- Subtitle: `{station slicer} · {window slicer} · M&E {n}s · Flight Ops {n}s`
- Tags for each non-default slicer
- No primary Publish button on landing (that lives on Planner)

### Band B — KPIs (`Tile` or `ClickableTile`)
Four tiles, same order:

| KPI | Meaning | Click |
| --- | --- | --- |
| Turnarounds in window | count in current slice | stay |
| At risk / delayed | count needing action | scroll to Band D |
| Staff fill | % assigned vs required hours | `/workforce` |
| Open alerts | unread operational alerts | `/alerts` |

Each tile: label `$label-01`, value `$heading-04`, delta text `$text-secondary` (e.g. `vs prior window`).

### Band C — analysis
- Left/top: status breakdown (`@carbon/charts-react` simple bar or stacked bar). Categories = status tags.
- Right/bottom: capacity required vs available hours for the sliced window (`MeterChart` or two-series bar).

Charts must use Carbon Charts + g90 chart theme. No third-party chart default colors.

### Band D — attention list
`DataTable` size `xs`, compact, no horizontal overflow (drop Stand and WP type columns at 1280).

Columns at 1440: Tail, Type, Window, Status (`Tag`), Staff fill (`ProgressBar`), OverflowMenu.  
At 1280: Tail, Window, Status, OverflowMenu.

Row click → `/planner/:id`.  
Empty state: `No turnarounds need action in this slice.`

### Band E — below fold
Compact vertical list or slim timeline of the sliced window. Must not force horizontal pan. If a Gantt cannot fit 800px canvas, omit it on landing and keep it on `/planner/:id`.

---

## 10. ASCII — MacBook 1440×900 Chrome

```
┌─────────────────────────────────────────────────────────────┐
│ Tech Ops  Assignment                         🔔  ?  👤     │ 48
├──────────────┬──────────────────────────────────────────────┤
│ Control twr  │ Control tower                                │
│ Planner      │ HEL · Now–12h · M&E 12s                      │
│ Workforce    │ [A320] [Night]          ← applied Tags       │
│ Alerts       │                                              │
│ Horizon      │ ┌──────┐┌──────┐┌──────┐┌──────┐             │
│ Reports      │ │ 42   ││  7   ││ 86%  ││  3   │  KPIs       │
│ ───────────  │ └──────┘└──────┘└──────┘└──────┘             │
│ Station    ▾ │                                              │
│ Time window▾ │ ┌ Status mix ─┐ ┌ Capacity ──┐               │
│ Fleet      ▾ │ │  bar chart  │ │  bar/meter │               │
│ Shift      ▾ │ └─────────────┘ └────────────┘               │
│ Status     ▾ │                                              │
│ Reset slice  │ Attention                                    │
│ ───────────  │ Tail  Window  Status  Fill                   │
│ Admin        │ OH-LWP  14:20  At risk  ██░░                 │
│              │ D-AIGX  15:05  Delayed  ███░                 │
└──────────────┴──────────────────────────────────────────────┘
     256px                    928px canvas
```

At 1280, KPI tiles wrap 2×2 and Band C stacks. Still no horizontal scroll.

---

## 11. Behavior

| Event | Result |
| --- | --- |
| Load `/` | dashboard for default slicers |
| Change slicer | all bands recompute; URL may keep query `?station=HEL&window=12h` |
| Click KPI At risk | scroll to attention table |
| Click attention row | Planner |
| SideNav route | keep slicers |
| Resize below 1280 | SideNav overlay; slicer menus still in SideNav |
| Chrome zoom 100% at 1440 | entire shell + Band A–D readable without sideways scroll |

---

## 12. Do not invent

- No horizontal `HeaderNavigation`
- No horizontal primary filter bar on `/`
- No `g100` or White theme
- No custom brand palette
- No max-width documentation layout
- No page footer
- No Gantt that overflows the MacBook canvas on landing
- No second right nav
- No theme switcher

---

## 13. Implementation snippet

```tsx
import {
  Theme, HeaderContainer, Header, SkipToContent, HeaderMenuButton,
  HeaderName, HeaderGlobalBar, HeaderGlobalAction, SideNav, SideNavItems,
  SideNavLink, SideNavMenu, SideNavMenuItem, SideNavDivider, Content,
} from '@carbon/react';
import {
  Notification, Help, UserAvatar, Dashboard, Calendar, UserMultiple,
  WarningAlt, Events, ChartLine, Settings, Location, Time, FilterRemove,
} from '@carbon/icons-react';

<Theme theme="g90">
  <HeaderContainer
    render={({ isSideNavExpanded, onClickSideNavExpand }) => (
      <>
        <Header aria-label="Assignment">
          <SkipToContent />
          <HeaderMenuButton
            aria-label={isSideNavExpanded ? 'Close menu' : 'Open menu'}
            onClick={onClickSideNavExpand}
            isActive={isSideNavExpanded}
            isCollapsible
          />
          <HeaderName href="/" prefix="Tech Ops">Assignment</HeaderName>
          <HeaderGlobalBar>{/* Alerts, Help, Account */}</HeaderGlobalBar>
        </Header>

        <SideNav
          aria-label="Side navigation"
          isChildOfHeader
          isFixedNav
          isPersistent
          defaultExpanded
          expanded
          href="#main-content"
        >
          <SideNavItems>
            <SideNavLink renderIcon={Dashboard} href="/" aria-current="page">
              Control tower
            </SideNavLink>
            {/* Planner, Workforce, Alerts, Horizon, Reports */}
            <SideNavDivider />
            <SideNavMenu renderIcon={Location} title="Station">
              <SideNavMenuItem href="#slicer-station-all">All stations</SideNavMenuItem>
              <SideNavMenuItem href="#slicer-station-HEL">HEL</SideNavMenuItem>
              <SideNavMenuItem href="#slicer-station-FRA">FRA</SideNavMenuItem>
              <SideNavMenuItem href="#slicer-station-MUC">MUC</SideNavMenuItem>
            </SideNavMenu>
            {/* Time window, Fleet, Shift, Status menus */}
            <SideNavLink renderIcon={FilterRemove} href="#reset-slicers">
              Reset slicers
            </SideNavLink>
            <SideNavDivider />
            <SideNavLink renderIcon={Settings} href="/admin">Admin</SideNavLink>
          </SideNavItems>
        </SideNav>

        <Content id="main-content">{children}</Content>
      </>
    )}
  />
</Theme>
```

Icons: `size={20}` only.

---

## 14. Acceptance checks

- Theme is `g90` on header, SideNav, and dashboard. Interactive blue is Carbon default.
- No horizontal navigation in the header.
- SideNav is a 256px vertical column with route links and slicer menus.
- Five slicers live in that column and reslice the dashboard immediately.
- `/` shows KPI tiles, two analysis charts, and an attention table.
- Chrome 1440×900 and 1280×800: no horizontal scrollbar, Band A–D usable.
- Gantt is not required above the fold on `/`.
- Skip link focuses `#main-content`.
