import type { ReactNode } from "react";

interface Props {
  title: ReactNode;
  /** Small uppercase line above the title, e.g. the content type an item belongs to. */
  eyebrow?: ReactNode;
  description?: ReactNode;
  /** Primary actions for the screen, right-aligned on wide viewports. */
  actions?: ReactNode;
}

/** Title block at the top of every admin screen. */
export default function PageHeader({ title, eyebrow, description, actions }: Props) {
  return (
    <header className="page-header">
      <div className="page-header__text">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p className="page-header__desc">{description}</p>}
      </div>

      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}
