import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ReferencePickerField from "./ReferencePickerField";
import { api, server } from "../test/server";

const personType = {
  id: "type-1",
  name: "Person",
  slug: "person",
  fields: [{ name: "fullName", type: "Text", required: true }],
};

const ada = {
  id: "item-ada",
  slug: "ada",
  status: "Published",
  dataJson: '{"fullName":"Ada Lovelace"}',
  updatedAt: "2026-08-10T11:00:00Z",
};

const draft = {
  id: "item-grace",
  slug: "grace",
  status: "Draft",
  dataJson: '{"fullName":"Grace Hopper"}',
  updatedAt: "2026-08-09T11:00:00Z",
};

function handlers(items: object[] = [ada]) {
  return [
    http.get(api("/api/content-types/person"), () => HttpResponse.json(personType)),
    http.get(api("/api/content-types/person/items"), () => HttpResponse.json(items)),
  ];
}

function renderField(props: Partial<Parameters<typeof ReferencePickerField>[0]> = {}) {
  const onChange = vi.fn();
  render(<ReferencePickerField targetType="person" value="" onChange={onChange} {...props} />);
  return onChange;
}

describe("ReferencePickerField", () => {
  beforeEach(() => localStorage.clear());

  it("labels each option by its heading field rather than by its id", async () => {
    server.use(...handlers());

    renderField();

    // A dropdown of Guids would be unusable; the first Text field is the item's name.
    expect(await screen.findByRole("option", { name: "Ada Lovelace" })).toBeInTheDocument();
  });

  it("marks an unpublished option as a draft", async () => {
    server.use(...handlers([ada, draft]));

    renderField();

    // Choosing one is allowed — an editor may reference something not yet live — but the
    // consequence should not be a surprise.
    expect(await screen.findByRole("option", { name: "Grace Hopper (draft)" })).toBeInTheDocument();
  });

  it("stores the chosen item's id", async () => {
    server.use(...handlers());

    const onChange = renderField();
    await screen.findByRole("option", { name: "Ada Lovelace" });

    await userEvent.setup().selectOptions(screen.getByRole("combobox"), ada.id);

    expect(onChange).toHaveBeenCalledWith(ada.id);
  });

  it("clears the field to undefined rather than an empty string", async () => {
    server.use(...handlers());

    const onChange = renderField({ value: ada.id });
    await screen.findByRole("option", { name: "Ada Lovelace" });

    await userEvent.setup().selectOptions(screen.getByRole("combobox"), "");

    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("warns when the referenced item has been deleted", async () => {
    server.use(...handlers([]));

    renderField({ value: "item-gone" });

    expect(await screen.findByText("Referenced item no longer exists.")).toBeInTheDocument();
  });

  it("says so when the schema gave it nothing to point at", () => {
    // A Reference field with no target is a schema mistake, and one this field cannot fix.
    renderField({ targetType: null });

    expect(screen.getByText("This field has no target content type.")).toBeInTheDocument();
  });

  it("shows a loading state until the options arrive", () => {
    server.use(...handlers());

    renderField();

    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("reports a failure to load the options", async () => {
    server.use(
      http.get(api("/api/content-types/person"), () => HttpResponse.text("boom", { status: 500 })),
      http.get(api("/api/content-types/person/items"), () => HttpResponse.json([]))
    );

    renderField();

    expect(await screen.findByText("boom")).toBeInTheDocument();
  });

  it("is read-only when disabled", async () => {
    server.use(...handlers());

    renderField({ disabled: true });

    expect(await screen.findByRole("combobox")).toBeDisabled();
  });
});
