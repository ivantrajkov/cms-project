interface Props {
  label?: string;
}

/** Full-area loading indicator, used while a screen's first request is in flight. */
export default function Loading({ label = "Loading…" }: Props) {
  return (
    <div className="loading" role="status">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  );
}
