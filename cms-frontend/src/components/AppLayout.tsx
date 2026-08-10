import { useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { clearSession, getSession } from "../lib/auth";
import Icon, { type IconName } from "./Icon";

export interface Crumb {
  label: string;
  /** Omitted for the current page, which is rendered as plain text. */
  to?: string;
}

interface Props {
  children: ReactNode;
  /** Trail shown in the top bar, ending with the current screen. */
  crumbs?: Crumb[];
}

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  /** Only match this exact path — needed for the dashboard at "/". */
  end?: boolean;
  adminOnly?: boolean;
}

const NAV: { heading: string; items: NavItem[] }[] = [
  {
    heading: "Content",
    items: [
      { to: "/", label: "Pages", icon: "file", end: true },
      { to: "/admin/content-types", label: "Content types", icon: "layers" },
      { to: "/admin/media", label: "Media", icon: "image" },
    ],
  },
  {
    heading: "Administration",
    items: [{ to: "/admin/users", label: "Users", icon: "users", adminOnly: true }],
  },
];

/**
 * Chrome shared by every admin screen: a persistent sidebar for navigation, a top bar for
 * breadcrumbs, and a centred content column.
 *
 * This replaces the per-page row of links the screens used to each render for themselves,
 * so where you are and where you can go is answered the same way everywhere. Below 900px
 * the sidebar becomes a drawer, since a fixed 252px column leaves nothing for content.
 */
export default function AppLayout({ children, crumbs }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const session = getSession();
  /**
   * The route the drawer was opened on, rather than a plain boolean. Navigating is the end
   * of the drawer's purpose — leaving it open would cover the page the user just asked for —
   * and deriving "open" from the current path closes it on navigation with no effect to
   * synchronise.
   */
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const drawerOpen = openedOn === location.pathname;

  function handleLogout() {
    clearSession();
    navigate("/login", { replace: true });
  }

  const role = session?.role ?? "Viewer";
  const email = session?.email ?? "";

  return (
    <div className="shell">
      {drawerOpen && (
        <button
          type="button"
          className="scrim"
          aria-label="Close navigation"
          onClick={() => setOpenedOn(null)}
        />
      )}

      <aside className="sidebar" data-open={drawerOpen}>
        <Link to="/" className="brand">
          <span className="brand__mark" aria-hidden="true">
            <Icon name="spark" size={18} />
          </span>
          <span className="brand__text">
            <span>Content Studio</span>
            <span className="brand__sub">Headless CMS</span>
          </span>
        </Link>

        {NAV.map((group) => {
          const items = group.items.filter((item) => !item.adminOnly || role === "Admin");
          if (items.length === 0) return null;

          return (
            <nav className="nav" key={group.heading}>
              <div className="nav__label">{group.heading}</div>
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `nav__item${isActive ? " is-active" : ""}`}
                >
                  <Icon name={item.icon} size={17} />
                  {item.label}
                </NavLink>
              ))}
            </nav>
          );
        })}

        <div className="sidebar__footer">
          <div className="account">
            <span className="avatar" aria-hidden="true">
              {email.slice(0, 1) || "?"}
            </span>
            <span className="account__id">
              <span className="account__email" title={email}>
                {email || "Signed out"}
              </span>
              <span className="account__role">{role}</span>
            </span>
            <button
              type="button"
              className="btn btn--ghost btn--icon"
              onClick={handleLogout}
              title="Log out"
              style={{ marginLeft: "auto" }}
            >
              <Icon name="logout" size={17} label="Log out" />
            </button>
          </div>
        </div>
      </aside>

      <div className="shell__main">
        <header className="topbar">
          <button
            type="button"
            className="btn btn--ghost btn--icon sidebar-toggle"
            onClick={() => setOpenedOn(location.pathname)}
          >
            <Icon name="menu" size={18} label="Open navigation" />
          </button>

          {crumbs && crumbs.length > 0 && (
            <nav className="crumbs" aria-label="Breadcrumb">
              {crumbs.map((crumb, index) => (
                <span key={`${crumb.label}-${index}`} className="crumbs">
                  {index > 0 && (
                    <span className="crumbs__sep" aria-hidden="true">
                      <Icon name="chevronRight" size={13} />
                    </span>
                  )}
                  {crumb.to ? (
                    <Link to={crumb.to}>{crumb.label}</Link>
                  ) : (
                    <span className="crumbs__current">{crumb.label}</span>
                  )}
                </span>
              ))}
            </nav>
          )}
        </header>

        <main className="shell__content">{children}</main>
      </div>
    </div>
  );
}
