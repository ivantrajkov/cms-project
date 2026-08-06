import type { Config, Slot } from "@measured/puck";
import ImageUploadField from "./components/ImageUploadField";
import ContentTypePicker from "./components/ContentTypePicker";
import ContentListBlock from "./components/ContentListBlock";

/**
 * Props for each block, keyed by component name. `Slot` props are drop-zones:
 * Puck turns them into components you render, so blocks can be nested and laid
 * out horizontally (e.g. two Buttons inside one Grid row).
 */
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
            padding: "64px 24px",
            textAlign: "center",
            background: "#111827",
            color: "#fff",
          }}
        >
          <h1 style={{ margin: 0, fontSize: "2.5rem" }}>{title}</h1>
          <p style={{ marginTop: 12, fontSize: "1.25rem", opacity: 0.85 }}>
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
            lineHeight: 1.6,
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
                borderRadius: 8,
              }}
            />
          ) : (
            <div
              style={{
                padding: 40,
                border: "2px dashed #d1d5db",
                borderRadius: 8,
                color: "#9ca3af",
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
              padding: "12px 24px",
              background: "#2563eb",
              color: "#fff",
              borderRadius: 8,
              textDecoration: "none",
              fontWeight: 600,
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
            background: "#111827",
            color: "#e5e7eb",
            padding: "40px 24px",
            marginTop: 40,
          }}
        >
          <div style={{ maxWidth: 960, margin: "0 auto" }}>
            <strong style={{ fontSize: "1.25rem", color: "#fff" }}>
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
