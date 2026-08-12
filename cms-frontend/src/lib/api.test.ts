import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, server } from "../test/server";
import { signIn } from "../test/auth";
import {
  deleteContentItem,
  getContentItem,
  getContentType,
  getMedia,
  itemLabel,
  listContentItems,
  listUsers,
  login,
  parseFieldValues,
  saveContentItem,
  toPuckData,
  updateMedia,
  uploadImage,
  uploadMedia,
  type ContentType,
} from "./api";
import { getToken } from "./auth";

describe("login", () => {
  beforeEach(() => localStorage.clear());

  it("stores the token so later calls are authenticated", async () => {
    server.use(
      http.post(api("/api/auth/login"), () =>
        HttpResponse.json({
          token: "issued.by.the.api",
          email: "admin@cms.local",
          role: "Admin",
          expiresAt: "2026-08-10T14:00:00Z",
        })
      )
    );

    const session = await login("admin@cms.local", "password");

    expect(session.role).toBe("Admin");
    expect(getToken()).toBe("issued.by.the.api");
  });

  it("sends the credentials as JSON", async () => {
    let body: unknown;
    server.use(
      http.post(api("/api/auth/login"), async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ token: "t", email: "e", role: "Admin", expiresAt: "" });
      })
    );

    await login("someone@cms.local", "hunter2");

    expect(body).toEqual({ email: "someone@cms.local", password: "hunter2" });
  });

  it("reports a rejection without wiping an existing session", async () => {
    // A 401 here is an expected answer, not a dead session — bouncing the user to the
    // login screen they are already on would replace the error with a blank form.
    signIn();
    server.use(
      http.post(api("/api/auth/login"), () =>
        HttpResponse.text("Invalid email or password.", { status: 401 })
      )
    );

    await expect(login("admin@cms.local", "wrong")).rejects.toThrow("Invalid email or password.");
    expect(getToken()).not.toBeNull();
  });
});

describe("error messages", () => {
  beforeEach(() => localStorage.clear());

  it("passes through a plain-text message", async () => {
    server.use(
      http.get(api("/api/users"), () => HttpResponse.text("Cannot delete the last Admin.", { status: 400 }))
    );

    await expect(listUsers()).rejects.toThrow("Cannot delete the last Admin.");
  });

  it("joins a JSON array of validation messages", async () => {
    // The shape the content endpoints use when a payload breaks its schema.
    server.use(
      http.get(api("/api/users"), () =>
        HttpResponse.json(["'title' is required.", "'views' must be a valid Number."], { status: 400 })
      )
    );

    await expect(listUsers()).rejects.toThrow(
      "'title' is required. 'views' must be a valid Number."
    );
  });

  it("flattens a ProblemDetails validation payload", async () => {
    server.use(
      http.get(api("/api/users"), () =>
        HttpResponse.json(
          { title: "One or more validation errors occurred.", errors: { Email: ["The Email field is required."] } },
          { status: 400 }
        )
      )
    );

    await expect(listUsers()).rejects.toThrow("The Email field is required.");
  });

  it("falls back to the ProblemDetails title", async () => {
    server.use(
      http.get(api("/api/users"), () => HttpResponse.json({ title: "Unsupported Media Type" }, { status: 415 }))
    );

    await expect(listUsers()).rejects.toThrow("Unsupported Media Type");
  });

  it("uses the caller's fallback when the body is empty", async () => {
    server.use(http.get(api("/api/users"), () => new HttpResponse(null, { status: 500 })));

    await expect(listUsers()).rejects.toThrow("Failed to list users (500)");
  });

  it("keeps a bare JSON string readable", async () => {
    server.use(http.get(api("/api/users"), () => HttpResponse.json("Nope.", { status: 400 })));

    await expect(listUsers()).rejects.toThrow("Nope.");
  });
});

describe("the bearer token", () => {
  beforeEach(() => localStorage.clear());

  it("is attached when there is a session", async () => {
    const token = signIn();
    let header: string | null = null;

    server.use(
      http.get(api("/api/users"), ({ request }) => {
        header = request.headers.get("authorization");
        return HttpResponse.json([]);
      })
    );

    await listUsers();

    expect(header).toBe(`Bearer ${token}`);
  });

  it("is left off when nobody is signed in", async () => {
    let header: string | null = "unset";

    server.use(
      http.get(api("/api/media/abc"), ({ request }) => {
        header = request.headers.get("authorization");
        return HttpResponse.json(null, { status: 404 });
      })
    );

    await getMedia("abc");

    expect(header).toBeNull();
  });

  it("is left off once it has expired", async () => {
    // Sending a dead token would turn an anonymous public page view into a 401.
    signIn({ expiresInSeconds: -1 });
    let header: string | null = "unset";

    server.use(
      http.get(api("/api/media/abc"), ({ request }) => {
        header = request.headers.get("authorization");
        return HttpResponse.json(null, { status: 404 });
      })
    );

    await getMedia("abc");

    expect(header).toBeNull();
  });
});

describe("a 401 from a protected call", () => {
  beforeEach(() => localStorage.clear());

  /**
   * The redirect that follows is deliberately not asserted here. jsdom's `window.location`
   * is unforgeable — `assign` cannot be replaced with a spy and the navigation is refused
   * rather than performed — so any assertion about it would be testing jsdom, not the app.
   * What matters and is observable is that the dead token does not survive.
   */
  it("drops the session so the token is never sent again", async () => {
    window.history.pushState({}, "", "/admin/users");
    signIn();

    vi.spyOn(console, "error").mockImplementation(() => {}); // jsdom's refused-navigation notice
    server.use(http.get(api("/api/users"), () => new HttpResponse(null, { status: 401 })));

    await expect(listUsers()).rejects.toThrow();

    expect(getToken()).toBeNull();

    window.history.pushState({}, "", "/");
  });

  it("clears the session without redirecting away from the login screen", async () => {
    // Redirecting to /login from /login would replace the error the user needs to read
    // with a blank form, and would drop the `next` they arrived with.
    window.history.pushState({}, "", "/login?next=%2Fadmin%2Fusers");
    signIn();

    server.use(http.get(api("/api/users"), () => new HttpResponse(null, { status: 401 })));

    await expect(listUsers()).rejects.toThrow();

    expect(getToken()).toBeNull();
    // Still on the login screen: had it navigated, jsdom would have reported it as an error.
    expect(window.location.pathname).toBe("/login");

    window.history.pushState({}, "", "/");
  });
});

describe("listContentItems", () => {
  beforeEach(() => localStorage.clear());

  async function capturedUrl(...args: Parameters<typeof listContentItems>): Promise<string> {
    let url = "";
    server.use(
      http.get(api("/api/content-types/:typeSlug/items"), ({ request }) => {
        url = new URL(request.url).pathname + new URL(request.url).search;
        return HttpResponse.json([]);
      })
    );

    await listContentItems(...args);
    return url;
  }

  it("asks for nothing extra by default", async () => {
    expect(await capturedUrl("page")).toBe("/api/content-types/page/items");
  });

  it("passes every option through", async () => {
    const url = await capturedUrl("page", { includeData: true, status: "Draft", limit: 5 });

    expect(url).toContain("includeData=true");
    expect(url).toContain("status=Draft");
    expect(url).toContain("limit=5");
  });

  it("omits a limit that would mean nothing", async () => {
    expect(await capturedUrl("page", { limit: 0 })).not.toContain("limit");
    expect(await capturedUrl("page", { limit: -3 })).not.toContain("limit");
  });

  it("escapes a slug so it cannot alter the path", async () => {
    expect(await capturedUrl("a/b")).toBe("/api/content-types/a%2Fb/items");
  });
});

describe("lookups that may find nothing", () => {
  beforeEach(() => localStorage.clear());

  it("returns null rather than throwing on a 404", async () => {
    server.use(
      http.get(api("/api/content-types/ghost"), () => new HttpResponse(null, { status: 404 })),
      http.get(api("/api/content-types/page/items/ghost"), () => new HttpResponse(null, { status: 404 })),
      http.get(api("/api/media/ghost"), () => new HttpResponse(null, { status: 404 }))
    );

    // "Not there" is a normal answer for these three; only a real failure should throw.
    expect(await getContentType("ghost")).toBeNull();
    expect(await getContentItem("page", "ghost")).toBeNull();
    expect(await getMedia("ghost")).toBeNull();
  });

  it("still throws on a genuine failure", async () => {
    server.use(
      http.get(api("/api/content-types/page"), () => HttpResponse.text("boom", { status: 500 }))
    );

    await expect(getContentType("page")).rejects.toThrow("boom");
  });
});

describe("writes", () => {
  beforeEach(() => localStorage.clear());

  it("sends the item as JSON", async () => {
    let body: unknown;
    server.use(
      http.post(api("/api/content-types/page/items"), async ({ request }) => {
        body = await request.json();
        expect(request.headers.get("content-type")).toContain("application/json");
        return HttpResponse.json({ id: "1", slug: "home", status: "Draft", dataJson: "{}", updatedAt: "" });
      })
    );

    await saveContentItem("page", { slug: "home", status: "Draft", dataJson: "{}" });

    expect(body).toEqual({ slug: "home", status: "Draft", dataJson: "{}" });
  });

  it("escapes both slugs when deleting", async () => {
    let path = "";
    server.use(
      http.delete(api("/api/content-types/:typeSlug/items/:itemSlug"), ({ request }) => {
        path = new URL(request.url).pathname;
        return new HttpResponse(null, { status: 204 });
      })
    );

    await deleteContentItem("a b", "c d");

    expect(path).toBe("/api/content-types/a%20b/items/c%20d");
  });

  it("sends alt text as JSON", async () => {
    let body: unknown;
    server.use(
      http.post(api("/api/media/abc"), async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: "abc", altText: "A cat" });
      })
    );

    await updateMedia("abc", "A cat");

    expect(body).toEqual({ altText: "A cat" });
  });
});

describe("uploads", () => {
  beforeEach(() => localStorage.clear());

  it("posts multipart form data and lets the browser set the boundary", async () => {
    let contentType: string | null = null;
    let uploadedName: string | null = null;

    server.use(
      http.post(api("/api/upload"), async ({ request }) => {
        contentType = request.headers.get("content-type");
        const form = await request.formData();
        // The API binds an `IFormFile file` parameter, so the part has to be named "file"
        // and has to arrive as a file rather than a stringified value.
        const part = form.get("file");
        uploadedName = part === null ? null : typeof part === "string" ? "sent as text" : "sent as a file";
        return HttpResponse.json({
          url: "http://localhost:5051/uploads/abc.png",
          id: "abc",
          originalFileName: "logo.png",
          sizeBytes: 3,
        });
      })
    );

    const result = await uploadMedia(new File(["png"], "logo.png", { type: "image/png" }));

    // Setting Content-Type by hand would omit the multipart boundary and the API could
    // not parse the body at all.
    expect(contentType).toContain("multipart/form-data");
    expect(contentType).toContain("boundary=");
    expect(uploadedName).toBe("sent as a file");
    expect(result.id).toBe("abc");
  });

  it("uploadImage hands back only the URL", async () => {
    server.use(
      http.post(api("/api/upload"), () =>
        HttpResponse.json({
          url: "http://localhost:5051/uploads/abc.png",
          id: "abc",
          originalFileName: "logo.png",
          sizeBytes: 3,
        })
      )
    );

    expect(await uploadImage(new File(["png"], "logo.png", { type: "image/png" }))).toBe(
      "http://localhost:5051/uploads/abc.png"
    );
  });
});

describe("parseFieldValues", () => {
  it("decodes a stored object", () => {
    expect(parseFieldValues('{"title":"Hello","views":2}')).toEqual({ title: "Hello", views: 2 });
  });

  it("gives an empty object for anything unusable", () => {
    // The editor must not crash on data written by an older schema or a bad migration.
    expect(parseFieldValues(null)).toEqual({});
    expect(parseFieldValues(undefined)).toEqual({});
    expect(parseFieldValues("")).toEqual({});
    expect(parseFieldValues("{ not json")).toEqual({});
    expect(parseFieldValues("[1,2,3]")).toEqual({});
    expect(parseFieldValues('"a string"')).toEqual({});
    expect(parseFieldValues("null")).toEqual({});
  });
});

describe("itemLabel", () => {
  const type: ContentType = {
    id: "1",
    name: "Blog post",
    slug: "post",
    fields: [
      { name: "hero", type: "Image", required: false },
      { name: "title", type: "Text", required: true },
      { name: "subtitle", type: "Text", required: false },
    ],
  };

  it("uses the value of the first Text field", () => {
    expect(itemLabel(type, { slug: "first", dataJson: '{"title":"Hello","subtitle":"World"}' })).toBe(
      "Hello"
    );
  });

  it("falls back to the slug when that field is empty", () => {
    expect(itemLabel(type, { slug: "first", dataJson: '{"title":"   "}' })).toBe("first");
    expect(itemLabel(type, { slug: "first", dataJson: "{}" })).toBe("first");
    expect(itemLabel(type, { slug: "first", dataJson: null })).toBe("first");
  });

  it("falls back to the slug when the value is not text", () => {
    expect(itemLabel(type, { slug: "first", dataJson: '{"title":42}' })).toBe("first");
  });

  it("falls back to the slug when the type is unknown or has no text field", () => {
    expect(itemLabel(null, { slug: "first", dataJson: '{"title":"Hello"}' })).toBe("first");
    expect(
      itemLabel({ ...type, fields: [{ name: "hero", type: "Image", required: false }] }, {
        slug: "first",
        dataJson: '{"title":"Hello"}',
      })
    ).toBe("first");
  });
});

describe("toPuckData", () => {
  it("passes a layout object through", () => {
    const layout = { content: [{ type: "Heading" }], root: { title: "Home" } };

    expect(toPuckData(layout)).toBe(layout);
  });

  it("gives an empty document for anything else", () => {
    const empty = { content: [], root: {} };

    expect(toPuckData(null)).toEqual(empty);
    expect(toPuckData(undefined)).toEqual(empty);
    expect(toPuckData("a string")).toEqual(empty);
    expect(toPuckData([1, 2])).toEqual(empty);
  });
});
