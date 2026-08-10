import type { Config, Slot } from "@measured/puck";
import ImageUploadField from "./components/ImageUploadField";
import ContentTypePicker from "./components/ContentTypePicker";
import ContentListBlock from "./components/ContentListBlock";

/**
 * Props for each block, keyed by component name. `Slot` props are drop-zones:
 * Puck turns them into components you render, so blocks can be nested and laid
 * out horizontally (e.g. two Buttons inside one Grid row).
 */
/**
 * Blocks are styled with literal values rather than the admin's CSS custom properties: what
 * they render is the published site, which should not change appearance if the admin theme
 * does. The values match the palette in index.css so the two still look related.
 */
const site = {
  ink: "#16161c",
  inkSoft: "#3e3e47",
  brand: "#6d3bf5",
  brandDark: "#4a20b4",
  line: "#e5e5ec",
  faint: "#a3a3b2",
} as const;

export interface Props {
  HeroBanner: { title: string; subtitle: string };
  TextBlock: { content: string };
  Image: { src: string; alt: string; width: number; align: "left" | "center" | "right" };
  Button: { label: string; url: string; align: "left" | "center" | "right" };
  Grid: { columns: number; gap: number; items: Slot };
  Footer: { companyName: string; text: string; items: Slot };
  Spacer: { height: number };
  ContentList: { contentType: string; columns: number; limit: number };
}

export const config: Config<Props> = {
  // Group blocks in the left-hand panel so "layout" vs "content" is obvious.
  categories: {
    layout: { title: "Layout", components: ["Grid", "Spacer"] },
    content: { title: "Content", components: ["HeroBanner", "TextBlock", "Image", "Button"] },
    dynamic: { title: "Dynamic", components: ["ContentList"] },
    sections: { title: "Sections", components: ["Footer"] },
  },

  components: {
    HeroBanner: {
      label: "Hero Banner",
      fields: {
        title: { type: "text" },
        subtitle: { type: "text" },
      },
      defaultProps: {
        title: "Welcome to your new page",
        subtitle: "Drag blocks from the left to start building.",
      },
      render: ({ title, subtitle }) => (
        <section
          style={{
            padding: "88px 24px",
            textAlign: "center",
            // Two soft highlights over a near-black base, so the band reads as designed
            // rather than as a flat rectangle.
            background: `radial-gradient(900px 420px at 20% -10%, rgb(109 59 245 / 55%), transparent 60%),
                         radial-gradient(700px 360px at 85% 110%, rgb(71 191 255 / 30%), transparent 60%),
                         ${site.ink}`,
            color: "#fff",
          }}
        >
          <h1
            style={{
              margin: "0 auto",
              maxWidth: 18 + "ch",
              // Scales with the viewport instead of overflowing a phone screen.
              fontSize: "clamp(2rem, 5.5vw, 3.25rem)",
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
            }}
          >
            {title}
          </h1>
          <p
            style={{
              margin: "16px auto 0",
              maxWidth: "52ch",
              fontSize: "clamp(1rem, 2vw, 1.2rem)",
              lineHeight: 1.6,
              opacity: 0.78,
            }}
          >
            {subtitle}
          </p>
        </section>
      ),
    },

    TextBlock: {
      label: "Text Block",
      fields: {
        content: { type: "textarea" },
      },
      defaultProps: {
        content: "Write some text here.",
      },
      render: ({ content }) => (
        <div
          style={{
            padding: "24px",
            maxWidth: 720,
            margin: "0 auto",
            color: site.inkSoft,
            fontSize: "1.05rem",
            lineHeight: 1.7,
            whiteSpace: "pre-wrap",
          }}
        >
          {content}
        </div>
      ),
    },

    Image: {
      label: "Image",
      fields: {
        // Custom field: uploads to the .NET backend (or accepts a pasted URL).
        src: {
          type: "custom",
          label: "Image",
          render: ({ value, onChange, readOnly }) => (
            <ImageUploadField
              value={value ?? ""}
              onChange={onChange}
              readOnly={readOnly}
            />
          ),
        },
        alt: { type: "text" },
        width: { type: "number", min: 0 },
        align: {
          type: "select",
          options: [
            { label: "Left", value: "left" },
            { label: "Center", value: "center" },
            { label: "Right", value: "right" },
          ],
        },
      },
      defaultProps: {
        src: "",
        alt: "",
        width: 600,
        align: "center",
      },
      render: ({ src, alt, width, align }) => (
        <div style={{ padding: "16px 24px", textAlign: align }}>
          {src ? (
            <img
              src={src}
              alt={alt}
              style={{
                width: width ? `${width}px` : "auto",
                maxWidth: "100%",
                height: "auto",
                borderRadius: 12,
                boxShadow: "0 12px 32px -12px rgb(16 17 26 / 25%)",
              }}
            />
          ) : (
            <div
              style={{
                padding: 40,
                border: `1px dashed ${site.line}`,
                borderRadius: 12,
                color: site.faint,
                fontSize: "0.9rem",
              }}
            >
              Select an image in the right-hand panel
            </div>
          )}
        </div>
      ),
    },

    Button: {
      label: "Button",
      fields: {
        label: { type: "text" },
        url: { type: "text" },
        align: {
          type: "select",
          options: [
            { label: "Left", value: "left" },
            { label: "Center", value: "center" },
            { label: "Right", value: "right" },
          ],
        },
      },
      defaultProps: {
        label: "Click me",
        url: "#",
        align: "center",
      },
      render: ({ label, url, align }) => (
        <div style={{ padding: "16px 24px", textAlign: align }}>
          <a
            href={url}
            style={{
              display: "inline-block",
              padding: "13px 26px",
              background: `linear-gradient(180deg, ${site.brand}, ${site.brandDark})`,
              color: "#fff",
              borderRadius: 10,
              textDecoration: "none",
              fontWeight: 600,
              boxShadow: "0 8px 20px -8px rgb(109 59 245 / 60%)",
            }}
          >
            {label}
          </a>
        </div>
      ),
    },

    // --- Layout ---------------------------------------------------------

    Grid: {
      label: "Grid (columns)",
      fields: {
        columns: {
          type: "select",
          options: [
            { label: "2 columns", value: 2 },
            { label: "3 columns", value: 3 },
            { label: "4 columns", value: 4 },
          ],
        },
        gap: { type: "number", min: 0 },
        items: { type: "slot" },
      },
      defaultProps: {
        columns: 2,
        gap: 16,
        items: [],
      },
      // The slot prop `items` arrives as a component (a drop-zone). Rendering it
      // with a CSS grid lets dropped blocks flow into columns — so you can put,
      // say, two Buttons side by side on one line.
      render: ({ columns, gap, items: Items }) => (
        <Items
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gap,
            padding: "16px 24px",
            maxWidth: 960,
            margin: "0 auto",
            alignItems: "start",
          }}
          minEmptyHeight={80}
        />
      ),
    },

    Spacer: {
      label: "Spacer",
      fields: {
        height: { type: "number", min: 0 },
      },
      defaultProps: {
        height: 48,
      },
      render: ({ height }) => <div style={{ height }} />,
    },

    // --- Dynamic --------------------------------------------------------

    ContentList: {
      label: "Content List",
      fields: {
        // Custom field: the options are the content types defined in the CMS, so a
        // type created at runtime can be selected here with no code change.
        contentType: {
          type: "custom",
          label: "Content type",
          render: ({ value, onChange, readOnly }) => (
            <ContentTypePicker value={value ?? ""} onChange={onChange} readOnly={readOnly} />
          ),
        },
        columns: {
          type: "select",
          options: [
            { label: "1 column", value: 1 },
            { label: "2 columns", value: 2 },
            { label: "3 columns", value: 3 },
            { label: "4 columns", value: 4 },
          ],
        },
        limit: { type: "number", min: 0, label: "Limit (0 = all)" },
      },
      defaultProps: {
        contentType: "",
        columns: 3,
        limit: 0,
      },
      // Unlike the other blocks, this one holds no content of its own — it reads
      // whatever items currently exist, so publishing a new item updates every page
      // using this block without any of them being edited.
      render: ({ contentType, columns, limit }) => (
        <ContentListBlock contentType={contentType} columns={columns} limit={limit} />
      ),
    },

    // --- Sections -------------------------------------------------------

    Footer: {
      label: "Footer",
      fields: {
        companyName: { type: "text" },
        text: { type: "textarea" },
        items: { type: "slot" },
      },
      defaultProps: {
        companyName: "FINKI Inc.",
        text: `© ${2026} FINKI Inc. All rights reserved.`,
        items: [],
      },
      render: ({ companyName, text, items: Items }) => (
        <footer
          style={{
            background: site.ink,
            color: "#e5e5ec",
            padding: "48px 24px",
            marginTop: 40,
          }}
        >
          <div style={{ maxWidth: 960, margin: "0 auto" }}>
            <strong
              style={{ fontSize: "1.2rem", color: "#fff", letterSpacing: "-0.02em" }}
            >
              {companyName}
            </strong>
            {/* Nested slot: drop a Grid or Buttons here for footer links/columns. */}
            <Items
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 16,
                margin: "16px 0",
              }}
              minEmptyHeight={40}
            />
            <p style={{ margin: 0, opacity: 0.7, fontSize: "0.9rem" }}>{text}</p>
          </div>
        </footer>
      ),
    },
  },
};

export default config;
