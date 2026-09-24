import {
  Content,
  Header,
  HeaderContainer,
  HeaderGlobalAction,
  HeaderGlobalBar,
  HeaderMenuButton,
  HeaderName,
  SkipToContent,
  SideNav,
  SideNavDivider,
  SideNavItems,
  SideNavLink,
  SideNavMenu,
  SideNavMenuItem,
} from '@carbon/react';
import {
  Plane,
  Calendar,
  ChartLine,
  ConditionPoint,
  Dashboard,
  Events,
  FilterRemove,
  Help,
  Location,
  Notification,
  Settings,
  Time,
  UserActivity,
  UserAvatar,
  UserMultiple,
  WarningAlt,
} from '@carbon/icons-react';
import { useLocation } from 'react-router-dom';
import { useMinWidth } from '../hooks/useMinWidth.js';
import { useSlice } from '../hooks/useSlice.js';
import {
  FLEETS,
  SHIFTS,
  SLICER_STATUSES,
  STATIONS,
  WINDOWS,
  windowLabel,
} from '../slicers/model.js';
import { useAppNavigate, useSlicerHref, useSlicers } from '../slicers/SlicerContext.jsx';

function sized(Icon) {
  function SizedIcon(props) {
    return <Icon {...props} size={20} />;
  }
  SizedIcon.displayName = Icon.displayName || Icon.name || 'Icon';
  return SizedIcon;
}

const DashboardIcon = sized(Dashboard);
const CalendarIcon = sized(Calendar);
const WorkforceIcon = sized(UserMultiple);
const AlertsIcon = sized(WarningAlt);
const HorizonIcon = sized(Events);
const ReportsIcon = sized(ChartLine);
const SettingsIcon = sized(Settings);
const LocationIcon = sized(Location);
const TimeIcon = sized(Time);
const AircraftIcon = sized(Plane);
const ShiftIcon = sized(UserActivity);
const StatusIcon = sized(ConditionPoint);
const ResetIcon = sized(FilterRemove);

const ROUTES = [
  { href: '/', label: 'Control tower', icon: DashboardIcon },
  { href: '/planner', label: 'Planner', icon: CalendarIcon },
  { href: '/workforce', label: 'Workforce', icon: WorkforceIcon },
  { href: '/alerts', label: 'Alerts', icon: AlertsIcon },
  { href: '/horizon', label: 'Horizon', icon: HorizonIcon },
  { href: '/reports', label: 'Reports', icon: ReportsIcon },
];

function isCurrent(pathname, href) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function ShellLink({ href, icon, children }) {
  const { pathname } = useLocation();
  const go = useAppNavigate();
  const toHref = useSlicerHref();
  const current = isCurrent(pathname, href);
  return (
    <SideNavLink
      href={toHref(href)}
      renderIcon={icon}
      large={false}
      aria-current={current ? 'page' : undefined}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        go(href);
      }}
    >
      {children}
    </SideNavLink>
  );
}

function SlicerItem({ href, active, onSelect, children }) {
  return (
    <SideNavMenuItem
      href={href}
      isActive={active}
      onClick={(event) => {
        event.preventDefault();
        onSelect();
      }}
    >
      {children}
    </SideNavMenuItem>
  );
}

function stationTitle(station) {
  return station === 'All stations' ? 'Station' : `Station · ${station}`;
}

function timeTitle(windowId) {
  return windowId === '12h' ? 'Time window' : `Time window · ${windowLabel(windowId)}`;
}

function fleetTitle(fleet) {
  if (fleet.length === 0) return 'Fleet';
  if (fleet.length === 1) return `Fleet · ${fleet[0]}`;
  return `Fleet · ${fleet.length}`;
}

function shiftTitle(shift) {
  return shift === 'All shifts' ? 'Shift' : `Shift · ${shift}`;
}

function statusTitle(status) {
  if (status.length === 0) return 'Status';
  if (status.length === 1) return `Status · ${status[0]}`;
  return `Status · ${status.length}`;
}

function ShellFrame({ children, isSideNavExpanded, onClickSideNavExpand }) {
  const isDesktop = useMinWidth(1280);
  const go = useAppNavigate();
  const toHref = useSlicerHref();
  const { slicers, setStation, setWindow, setShift, toggleFleet, toggleStatus, reset } = useSlicers();
  const slice = useSlice();
  const unread = slice.alerts.filter((alert) => alert.unread).length;
  const navExpanded = isDesktop || isSideNavExpanded;

  return (
    <>
      <Header aria-label="Assignment">
        <SkipToContent href="#main-content" />
        <HeaderMenuButton
          aria-label={navExpanded ? 'Close menu' : 'Open menu'}
          isActive={navExpanded}
          isCollapsible
          onClick={onClickSideNavExpand}
        />
        <HeaderName
          href={toHref('/')}
          prefix="Tech Ops"
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
            event.preventDefault();
            go('/');
          }}
        >
          Assignment
        </HeaderName>
        <HeaderGlobalBar>
          <HeaderGlobalAction
            aria-label="Alerts"
            className="header-alerts"
            aria-describedby={unread > 0 ? 'alert-count' : undefined}
            onClick={() => go('/alerts')}
          >
            <Notification size={20} />
            {unread > 0 ? (
              <>
                <span className="header-alerts__badge" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>
                <span id="alert-count" className="cds--visually-hidden">{unread} unread</span>
              </>
            ) : null}
          </HeaderGlobalAction>
          <HeaderGlobalAction aria-label="Help" tooltipAlignment="end" onClick={() => {}}>
            <Help size={20} />
          </HeaderGlobalAction>
          <HeaderGlobalAction aria-label="Account" tooltipAlignment="end" onClick={() => {}}>
            <UserAvatar size={20} />
          </HeaderGlobalAction>
        </HeaderGlobalBar>
      </Header>
      <SideNav
        aria-label="Side navigation"
        isRail={false}
        isChildOfHeader
        isFixedNav={isDesktop}
        isPersistent={isDesktop}
        defaultExpanded
        expanded={navExpanded}
        href="#main-content"
        onOverlayClick={onClickSideNavExpand}
      >
        <SideNavItems>
          {ROUTES.map((route) => (
            <ShellLink key={route.href} href={route.href} icon={route.icon}>
              {route.label}
            </ShellLink>
          ))}
          <SideNavDivider />
          <SideNavMenu title={stationTitle(slicers.station)} renderIcon={LocationIcon} defaultExpanded={false} isActive={slicers.station !== 'All stations'}>
            <SlicerItem href="#slicer-station-all" active={slicers.station === 'All stations'} onSelect={() => setStation('All stations')}>
              All stations
            </SlicerItem>
            {STATIONS.map((station) => (
              <SlicerItem
                key={station}
                href={`#slicer-station-${station}`}
                active={slicers.station === station}
                onSelect={() => setStation(station)}
              >
                {station}
              </SlicerItem>
            ))}
          </SideNavMenu>
          <SideNavMenu title={timeTitle(slicers.window)} renderIcon={TimeIcon} defaultExpanded={false} isActive={slicers.window !== '12h'}>
            {WINDOWS.map((item) => (
              <SlicerItem
                key={item.id}
                href={`#slicer-window-${item.id}`}
                active={slicers.window === item.id}
                onSelect={() => setWindow(item.id)}
              >
                {item.label}
              </SlicerItem>
            ))}
          </SideNavMenu>
          <SideNavMenu title={fleetTitle(slicers.fleet)} renderIcon={AircraftIcon} defaultExpanded={false} isActive={slicers.fleet.length > 0}>
            <SlicerItem href="#slicer-fleet-all" active={slicers.fleet.length === 0} onSelect={() => toggleFleet('all')}>
              All fleets
            </SlicerItem>
            {FLEETS.map((fleet) => (
              <SlicerItem
                key={fleet}
                href={`#slicer-fleet-${fleet.replace(/\s+/g, '-').toLowerCase()}`}
                active={slicers.fleet.includes(fleet)}
                onSelect={() => toggleFleet(fleet)}
              >
                {fleet}
              </SlicerItem>
            ))}
          </SideNavMenu>
          <SideNavMenu title={shiftTitle(slicers.shift)} renderIcon={ShiftIcon} defaultExpanded={false} isActive={slicers.shift !== 'All shifts'}>
            <SlicerItem href="#slicer-shift-all" active={slicers.shift === 'All shifts'} onSelect={() => setShift('All shifts')}>
              All shifts
            </SlicerItem>
            {SHIFTS.map((shift) => (
              <SlicerItem
                key={shift}
                href={`#slicer-shift-${shift.toLowerCase()}`}
                active={slicers.shift === shift}
                onSelect={() => setShift(shift)}
              >
                {shift}
              </SlicerItem>
            ))}
          </SideNavMenu>
          <SideNavMenu title={statusTitle(slicers.status)} renderIcon={StatusIcon} defaultExpanded={false} isActive={slicers.status.length > 0}>
            <SlicerItem href="#slicer-status-all" active={slicers.status.length === 0} onSelect={() => toggleStatus('all')}>
              All
            </SlicerItem>
            {SLICER_STATUSES.map((status) => (
              <SlicerItem
                key={status}
                href={`#slicer-status-${status.replace(/\s+/g, '-').toLowerCase()}`}
                active={slicers.status.includes(status)}
                onSelect={() => toggleStatus(status)}
              >
                {status}
              </SlicerItem>
            ))}
          </SideNavMenu>
          <SideNavLink
            renderIcon={ResetIcon}
            href="#reset-slicers"
            large={false}
            onClick={(event) => {
              event.preventDefault();
              reset();
            }}
          >
            Reset slicers
          </SideNavLink>
          <SideNavDivider />
          <ShellLink href="/admin" icon={SettingsIcon}>Admin</ShellLink>
        </SideNavItems>
      </SideNav>
      <Content id="main-content" tabIndex={-1}>
        {children}
      </Content>
    </>
  );
}

export function AppShell({ children }) {
  return (
    <HeaderContainer
      render={({ isSideNavExpanded, onClickSideNavExpand }) => (
        <ShellFrame
          isSideNavExpanded={isSideNavExpanded}
          onClickSideNavExpand={onClickSideNavExpand}
        >
          {children}
        </ShellFrame>
      )}
    />
  );
}
