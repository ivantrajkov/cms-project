/**
 * The handful of line icons the admin UI uses, as inline SVG.
 *
 * Inline rather than an icon package: a dozen paths weigh nothing, they inherit
 * `currentColor` so they pick up the surrounding text colour automatically, and there is
 * no extra dependency to keep in step with the rest of the project.
 */

export type IconName =
  | "alert"
  | "arrowLeft"
  | "check"
  | "chevronRight"
  | "clock"
  | "external"
  | "file"
  | "image"
  | "key"
  | "layers"
  | "logout"
  | "menu"
  | "pencil"
  | "plus"
  | "spark"
  | "trash"
  | "upload"
  | "users";

/** Path data for each icon, drawn on a 24×24 grid with a 1.7px stroke. */
const PATHS: Record<IconName, string[]> = {
  alert: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z", "M12 8v5", "M12 16.5h.01"],
  arrowLeft: ["M19 12H5", "m11 18-6-6 6-6"],
  check: ["m5 13 4 4L19 7"],
  chevronRight: ["m9 6 6 6-6 6"],
  clock: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z", "M12 7.5V12l3 2"],
  external: ["M14 4h6v6", "M20 4l-9 9", "M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"],
  file: ["M14 3v4a1 1 0 0 0 1 1h4", "M19 8v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7Z", "M9 13h6", "M9 17h4"],
  image: [
    "M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z",
    "M9 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
    "m4.5 17.5 4.9-4.9a2 2 0 0 1 2.8 0L20 20",
  ],
  key: ["M15.5 8.5a3 3 0 1 0-3 3", "m12.5 11.5-8 8V21h2.5v-2H9v-2.5h2l1.5-1.5"],
  layers: ["m12 3 8.5 4.5L12 12 3.5 7.5 12 3Z", "m3.5 12 8.5 4.5L20.5 12", "m3.5 16.5 8.5 4.5 8.5-4.5"],
  logout: ["M9.5 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.5", "m16 16 4-4-4-4", "M20 12H9"],
  menu: ["M4 7h16", "M4 12h16", "M4 17h16"],
  pencil: ["m4 20 4.5-1L20 7.5a2.1 2.1 0 0 0-3-3L5.5 15.5 4 20Z"],
  plus: ["M12 5v14", "M5 12h14"],
  spark: ["m12 3 1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4L12 3Z"],
  trash: ["M4 7h16", "M10 11v6", "M14 11v6", "m6 7 1 12.1A1 1 0 0 0 8 20h8a1 1 0 0 0 1-.9L18 7", "M9.5 7V4h5v3"],
  upload: ["M12 16.5V4", "m7 9 5-5 5 5", "M4 20h16"],
  users: [
    "M9.5 11a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z",
    "M2.5 20.5a7 7 0 0 1 14 0",
    "M16.5 4.2a3.75 3.75 0 0 1 0 6.6",
    "M18 14.4a6 6 0 0 1 3.5 5.4",
  ],
};

interface Props {
  name: IconName;
  size?: number;
  /** Decorative by default; pass a label when the icon is the only content of a control. */
  label?: string;
  className?: string;
}

export default function Icon({ name, size = 16, label, className }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
