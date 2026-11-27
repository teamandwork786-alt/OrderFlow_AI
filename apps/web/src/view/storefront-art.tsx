/** Inline SVG artwork. No icon library and no product photos until Slice 1D. */
export function BotanicalMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      >
        <path d="M16 29V15" />
        <path d="M16 22c-4 0-6-2-6-5 3 0 6 1.5 6 5Z" />
        <path d="M16 19c4 0 6-2 6-5-3 0-6 1.5-6 5Z" />
        <circle cx="16" cy="9" r="2.2" />
        <path d="M16 6.8c0-2.2-1.4-3.8-3.2-3.8 0 2.2 1.4 3.8 3.2 3.8Zm0 0c0-2.2 1.4-3.8 3.2-3.8 0 2.2-1.4 3.8-3.2 3.8Zm2.2 2.2c2.2 0 3.8-1.4 3.8-3.2-2.2 0-3.8 1.4-3.8 3.2Zm-4.4 0c-2.2 0-3.8-1.4-3.8-3.2 2.2 0 3.8 1.4 3.8 3.2Z" />
      </g>
    </svg>
  );
}

const PALETTE: Record<string, { bg: string; fg: string }> = {
  Mirrors: { bg: "#EFE6D8", fg: "#8A6A2F" },
  Lamps: { bg: "#F1E9DF", fg: "#B4532A" },
  "Vases & Glass": { bg: "#F0E8DC", fg: "#A36A2E" },
  "Artificial Plants": { bg: "#E5EAE1", fg: "#4A5D4E" }
};

export function CategoryTile({ category }: { category: string }) {
  const colours = PALETTE[category] ?? { bg: "#F3EFEA", fg: "#4A5D4E" };
  return (
    <svg
      className="tile-art"
      viewBox="0 0 200 200"
      role="img"
      aria-label={`${category} illustration`}
      style={{ background: colours.bg, color: colours.fg }}
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      >
        {category === "Mirrors" && (
          <>
            <path d="M70 160V72c0-26 60-26 60 0v88Z" />
            <path d="M80 150V76c0-18 40-18 40 0v74" opacity=".5" />
          </>
        )}
        {category === "Lamps" && (
          <>
            <path d="M70 70h60l14 50H56Z" />
            <path d="M100 120v34M80 160h40" />
          </>
        )}
        {category === "Vases & Glass" && (
          <>
            <path d="M88 44h24M92 44c0 22-26 30-26 62 0 28 14 50 34 50s34-22 34-50c0-32-26-40-26-62" />
            <path d="M82 112c10 6 26 6 36 0" opacity=".5" />
          </>
        )}
        {category === "Artificial Plants" && (
          <>
            <path d="M100 150V70" />
            <path d="M100 118c-22 0-30-14-30-28 18 0 30 10 30 28Zm0-24c22 0 30-14 30-28-18 0-30 10-30 28Z" />
            <path d="M76 150h48l-6 28H82Z" />
          </>
        )}
        {!PALETTE[category] && <circle cx="100" cy="100" r="40" />}
      </g>
    </svg>
  );
}
