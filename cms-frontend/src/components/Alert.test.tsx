import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Alert from "./Alert";

describe("Alert", () => {
  it("announces an error immediately", () => {
    render(<Alert tone="error">Could not save.</Alert>);

    // role="alert" is assertive: a failed save gives no other visible signal, so a screen
    // reader user has to be told without waiting for the next natural pause.
    const alert = screen.getByRole("alert");

    expect(alert).toHaveTextContent("Could not save.");
    expect(alert).toHaveClass("alert--error");
  });

  it.each(["success", "info"] as const)("announces %s politely", (tone) => {
    render(<Alert tone={tone}>All good.</Alert>);

    const status = screen.getByRole("status");

    expect(status).toHaveTextContent("All good.");
    expect(status).toHaveClass(`alert--${tone}`);
  });
});
