import type { ReactNode } from "react";
import Icon from "./Icon";

interface Props {
  tone: "error" | "success" | "info";
  children: ReactNode;
}

/**
 * Inline message for the result of an action. Errors are announced to assistive tech as
 * they appear, because a failed save gives no other visible signal.
 */
export default function Alert({ tone, children }: Props) {
  return (
    <div className={`alert alert--${tone}`} role={tone === "error" ? "alert" : "status"}>
      <Icon name={tone === "error" ? "alert" : "check"} size={16} />
      <span>{children}</span>
    </div>
  );
}
