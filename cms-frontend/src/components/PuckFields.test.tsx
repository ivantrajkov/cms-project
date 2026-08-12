import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ContentTypePicker from "./ContentTypePicker";
import ImageUploadField from "./ImageUploadField";
import { api, server } from "../test/server";
import { signIn } from "../test/auth";

/**
 * The two custom fields the page builder's right-hand panel is made of. Puck owns their
 * layout; what matters here is that they read the API rather than a hard-coded list, and
 * that they hand back the value the config expects.
 */

describe("ContentTypePicker", () => {
  beforeEach(() => localStorage.clear());

  it("offers the types defined at runtime, so a new one needs no code change", async () => {
    server.use(
      http.get(api("/api/content-types"), () =>
        HttpResponse.json([
          { id: "1", name: "Blog post", slug: "post" },
          { id: "2", name: "Person", slug: "person" },
        ])
      )
    );

    render(<ContentTypePicker value="" onChange={vi.fn()} />);

    expect(await screen.findByRole("option", { name: "Blog post" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Person" })).toBeInTheDocument();
  });

  it("reports the chosen type by its slug", async () => {
    server.use(
      http.get(api("/api/content-types"), () =>
        HttpResponse.json([{ id: "1", name: "Blog post", slug: "post" }])
      )
    );

    const onChange = vi.fn();
    render(<ContentTypePicker value="" onChange={onChange} />);
    await screen.findByRole("option", { name: "Blog post" });

    await userEvent.setup().selectOptions(screen.getByRole("combobox"), "post");

    expect(onChange).toHaveBeenCalledWith("post");
  });

  it("reports a failure to load", async () => {
    server.use(http.get(api("/api/content-types"), () => HttpResponse.text("boom", { status: 500 })));

    render(<ContentTypePicker value="" onChange={vi.fn()} />);

    expect(await screen.findByText("boom")).toBeInTheDocument();
  });

  it("is read-only when the block is", async () => {
    server.use(http.get(api("/api/content-types"), () => HttpResponse.json([])));

    render(<ContentTypePicker value="" onChange={vi.fn()} readOnly />);

    await waitFor(() => expect(screen.getByRole("combobox")).toBeDisabled());
  });
});

describe("ImageUploadField", () => {
  const uploaded = "http://localhost:5051/uploads/abc.png";

  beforeEach(() => localStorage.clear());

  it("uploads a file and stores the returned URL", async () => {
    signIn();
    server.use(
      http.post(api("/api/upload"), () =>
        HttpResponse.json({ url: uploaded, id: "media-1", originalFileName: "hero.png", sizeBytes: 3 })
      )
    );

    const onChange = vi.fn();
    render(<ImageUploadField value="" onChange={onChange} />);

    await userEvent
      .setup()
      .upload(
        document.querySelector("input[type=file]") as HTMLInputElement,
        new File(["png"], "hero.png", { type: "image/png" })
      );

    // This field predates the media library and stores a URL, not an asset id.
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(uploaded));
  });

  it("accepts a pasted URL too", async () => {
    const onChange = vi.fn();
    render(<ImageUploadField value="" onChange={onChange} />);

    await userEvent.setup().type(screen.getByPlaceholderText("…or paste an image URL"), "h");

    expect(onChange).toHaveBeenCalledWith("h");
  });

  it("previews whatever URL it holds", () => {
    render(<ImageUploadField value={uploaded} onChange={vi.fn()} />);

    expect(screen.getByRole("img", { name: "preview" })).toHaveAttribute("src", uploaded);
  });

  it("reports a failed upload and keeps the old value", async () => {
    signIn();
    server.use(
      http.post(api("/api/upload"), () =>
        HttpResponse.text("Unsupported file type. Allowed: jpg, png, gif, webp, svg.", { status: 400 })
      )
    );

    const onChange = vi.fn();
    render(<ImageUploadField value={uploaded} onChange={onChange} />);

    await userEvent
      .setup()
      .upload(
        document.querySelector("input[type=file]") as HTMLInputElement,
        new File(["gif"], "broken.gif", { type: "image/gif" })
      );

    expect(await screen.findByText(/Unsupported file type/)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("img", { name: "preview" })).toHaveAttribute("src", uploaded);
  });

  it("offers nothing to change when read-only", () => {
    render(<ImageUploadField value={uploaded} onChange={vi.fn()} readOnly />);

    expect(screen.getByRole("button", { name: /Upload image/ })).toBeDisabled();
    expect(screen.getByPlaceholderText("…or paste an image URL")).toHaveAttribute("readonly");
  });
});
