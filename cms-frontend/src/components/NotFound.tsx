import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import Icon from "./Icon";

interface Props {
  /** Small label above the heading, e.g. "404" or "Not authorized". */
  code: string;
  title: ReactNode;
  text?: ReactNode;
  action?: { to: string; label: string };
}

/**
 * Standalone message screen for the dead ends: a missing page, a draft requested by a
 * visitor, a route the current role may not open. Every one of them offers a way onward,
 * so the user is never left on a screen with nothing to do.
 */
export default function NotFound({ code, title, text, action }: Props) {
  return (
    <div className="notice">
      <div className="notice__card">
        <span className="empty__icon" aria-hidden="true">
          <Icon name="alert" size={20} />
        </span>
        <span className="notice__code">{code}</span>
        <h1>{title}</h1>
        {text && <p className="notice__text">{text}</p>}
        {action && (
          <Link to={action.to} className="btn btn--primary" style={{ marginTop: 8 }}>
            {action.label}
            <Icon name="chevronRight" size={15} />
          </Link>
        )}
      </div>
    </div>
  );
}
