import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import EmptyState from "./EmptyState";

describe("EmptyState", () => {
  it("says what belongs here", () => {
    render(<EmptyState title="No content types yet" />);

    expect(screen.getByText("No content types yet")).toBeInTheDocument();
  });

  it("shows the description and action when given", () => {
    render(
      <EmptyState
        title="No items"
        description="Create one to get started."
        action={<button type="button">New item</button>}
      />
    );

    expect(screen.getByText("Create one to get started.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New item" })).toBeInTheDocument();
  });

  it("hides its icon from assistive tech", () => {
    const { container } = render(<EmptyState title="No items" />);

    // The icon repeats what the title already says, so announcing it adds only noise.
    expect(container.querySelector(".empty__icon")).toHaveAttribute("aria-hidden", "true");
  });
});
