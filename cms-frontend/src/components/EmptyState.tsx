import type { ReactNode } from "react";
import Icon, { type IconName } from "./Icon";

interface Props {
  title: string;
  icon?: IconName;
  description?: ReactNode;
  /** Optional call to action, e.g. a button that creates the first item. */
  action?: ReactNode;
}

/**
 * Shown instead of an empty list. An empty screen should say what belongs there and how to
 * put it there, rather than leaving the user to guess whether anything failed to load.
 */
export default function EmptyState({ title, icon = "file", description, action }: Props) {
  return (
    <div className="empty">
      <span className="empty__icon" aria-hidden="true">
        <Icon name={icon} size={20} />
      </span>
      <p className="empty__title">{title}</p>
      {description && <p className="empty__text">{description}</p>}
      {action}
    </div>
  );
}
