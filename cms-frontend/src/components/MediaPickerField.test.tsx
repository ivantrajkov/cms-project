import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MediaPickerField from "./MediaPickerField";
import { api, server } from "../test/server";
import { signIn } from "../test/auth";

const hero = {
  id: "media-1",
  fileName: "abc.png",
  originalFileName: "hero.png",
  url: "http://localhost:5051/uploads/abc.png",
  contentType: "image/png",
  sizeBytes: 1024,
  altText: "A wide landscape",
  uploadedAt: "2026-08-10T11:00:00Z",
};

function renderField(props: Partial<Parameters<typeof MediaPickerField>[0]> = {}) {
  const onChange = vi.fn();
  render(<MediaPickerField value="" onChange={onChange} {...props} />);
  return onChange;
}

describe("MediaPickerField", () => {
  beforeEach(() => localStorage.clear());

  it("offers every asset in the library, captioned where there is alt text", async () => {
    server.use(http.get(api("/api/media"), () => HttpResponse.json([hero])));

    renderField();

    expect(await screen.findByRole("option", { name: "hero.png — A wide landscape" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "No image" })).toBeInTheDocument();
  });

  it("stores the chosen asset's id, not its URL", async () => {
    server.use(http.get(api("/api/media"), () => HttpResponse.json([hero])));

    const onChange = renderField();
    await screen.findByRole("option", { name: /hero.png/ });

    await userEvent.setup().selectOptions(screen.getByRole("combobox"), hero.id);

    // Storing the id is what makes captions and delete guards possible later.
    expect(onChange).toHaveBeenCalledWith(hero.id);
  });

  it("clears the field to undefined rather than an empty string", async () => {
    server.use(http.get(api("/api/media"), () => HttpResponse.json([hero])));

    const onChange = renderField({ value: hero.id });
    await screen.findByRole("option", { name: /hero.png/ });

    await userEvent.setup().selectOptions(screen.getByRole("combobox"), "");

    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("previews the selected asset", async () => {
    server.use(http.get(api("/api/media"), () => HttpResponse.json([hero])));

    renderField({ value: hero.id });

    expect(await screen.findByRole("img", { name: "A wide landscape" })).toHaveAttribute(
      "src",
      hero.url
    );
  });

  it("warns when the selected asset has been deleted from under the item", async () => {
    server.use(http.get(api("/api/media"), () => HttpResponse.json([])));

    renderField({ value: "media-gone" });

    expect(await screen.findByText("Selected image no longer exists.")).toBeInTheDocument();
  });

  it("uploads a file and selects it straight away", async () => {
    signIn();
    let listCalls = 0;
    server.use(
      http.get(api("/api/media"), () => {
        listCalls += 1;
        return HttpResponse.json(listCalls === 1 ? [] : [hero]);
      }),
      http.post(api("/api/upload"), () =>
        HttpResponse.json({ url: hero.url, id: hero.id, originalFileName: "hero.png", sizeBytes: 1024 })
      )
    );

    const onChange = renderField();
    await waitFor(() => expect(listCalls).toBe(1));

    await userEvent
      .setup()
      .upload(
        document.querySelector("input[type=file]") as HTMLInputElement,
        new File(["png"], "hero.png", { type: "image/png" })
      );

    // Uploading and then having to find the file in the list would be a pointless step.
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(hero.id));
  });

  it("reports a failed upload", async () => {
    signIn();
    server.use(
      http.get(api("/api/media"), () => HttpResponse.json([])),
      http.post(api("/api/upload"), () => HttpResponse.text("File exceeds the 5 MB limit.", { status: 400 }))
    );

    renderField();
    await screen.findByRole("combobox");

    await userEvent
      .setup()
      .upload(
        document.querySelector("input[type=file]") as HTMLInputElement,
        new File(["png"], "huge.png", { type: "image/png" })
      );

    expect(await screen.findByText("File exceeds the 5 MB limit.")).toBeInTheDocument();
  });

  it("reports a failure to load the library", async () => {
    server.use(http.get(api("/api/media"), () => HttpResponse.text("boom", { status: 500 })));

    renderField();

    expect(await screen.findByText("boom")).toBeInTheDocument();
  });

  it("offers no upload when the field is disabled", async () => {
    server.use(http.get(api("/api/media"), () => HttpResponse.json([hero])));

    renderField({ disabled: true });

    expect(await screen.findByRole("combobox")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Upload/ })).not.toBeInTheDocument();
  });
});
