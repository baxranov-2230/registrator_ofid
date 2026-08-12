import { Box } from "@mui/material";

/**
 * Decorative campus scene for the dashboard hero.
 *
 * Drawn inline rather than shipped as an asset: it stays crisp at any size,
 * costs no extra request, and picks up the app's indigo palette directly.
 * Purely ornamental, so it is hidden from assistive tech.
 */
export default function CampusIllustration() {
  return (
    <Box
      component="svg"
      viewBox="0 0 520 260"
      role="presentation"
      aria-hidden="true"
      sx={{
        width: "100%",
        height: "auto",
        maxWidth: 520,
        display: "block",
        // The scene is drawn on a transparent ground so it sits on the hero.
        overflow: "visible",
      }}
    >
      <defs>
        <linearGradient id="royd-roof" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#4F46E5" />
        </linearGradient>
        <linearGradient id="royd-wing" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#93B4FF" />
          <stop offset="100%" stopColor="#6E9BFF" />
        </linearGradient>
        <linearGradient id="royd-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5B76F7" />
          <stop offset="100%" stopColor="#4055D8" />
        </linearGradient>
      </defs>

      {/* clouds */}
      <g fill="#DBEAFE" opacity=".9">
        <ellipse cx="72" cy="52" rx="26" ry="12" />
        <ellipse cx="94" cy="52" rx="18" ry="9" />
        <ellipse cx="452" cy="40" rx="22" ry="10" />
        <ellipse cx="470" cy="40" rx="15" ry="8" />
      </g>

      {/* trees — back row */}
      <g>
        {[
          [40, 196],
          [96, 190],
          [432, 192],
          [486, 198],
        ].map(([x, y]) => (
          <g key={`t${x}`}>
            <rect x={x - 3} y={y} width="6" height="26" rx="3" fill="#7C8DB5" />
            <circle cx={x} cy={y - 6} r="22" fill="#8FD4A8" />
            <circle cx={x - 12} cy={y + 4} r="15" fill="#7FC79A" />
            <circle cx={x + 12} cy={y + 4} r="15" fill="#A5DDB8" />
          </g>
        ))}
      </g>

      {/* left wing */}
      <g>
        <rect x="118" y="150" width="104" height="76" rx="6" fill="url(#royd-wing)" />
        <rect x="112" y="140" width="116" height="14" rx="4" fill="#7FA5FF" />
        {[0, 1, 2].map((r) =>
          [0, 1, 2].map((c) => (
            <rect
              key={`lw${r}${c}`}
              x={132 + c * 28}
              y={164 + r * 22}
              width="18"
              height="15"
              rx="2.5"
              fill="#EAF1FF"
              opacity={r === 2 ? 0.75 : 1}
            />
          )),
        )}
      </g>

      {/* right wing */}
      <g>
        <rect x="298" y="150" width="104" height="76" rx="6" fill="url(#royd-wing)" />
        <rect x="292" y="140" width="116" height="14" rx="4" fill="#7FA5FF" />
        {[0, 1, 2].map((r) =>
          [0, 1, 2].map((c) => (
            <rect
              key={`rw${r}${c}`}
              x={312 + c * 28}
              y={164 + r * 22}
              width="18"
              height="15"
              rx="2.5"
              fill="#EAF1FF"
              opacity={r === 2 ? 0.75 : 1}
            />
          )),
        )}
      </g>

      {/* main hall */}
      <g>
        <rect x="196" y="104" width="128" height="122" rx="6" fill="url(#royd-body)" />
        {/* pediment */}
        <path d="M260 58 L336 106 L184 106 Z" fill="url(#royd-roof)" />
        <rect x="180" y="104" width="160" height="12" rx="4" fill="#6366F1" />

        {/* clock */}
        <circle cx="260" cy="90" r="13" fill="#EEF2FF" />
        <circle cx="260" cy="90" r="13" fill="none" stroke="#4F46E5" strokeWidth="2" />
        <path
          d="M260 83 V90 L265 94"
          stroke="#4338CA"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />

        {/* columns */}
        {[0, 1, 2, 3].map((i) => (
          <rect
            key={`col${i}`}
            x={208 + i * 30}
            y="124"
            width="14"
            height="82"
            rx="3"
            fill="#EAF1FF"
            opacity=".92"
          />
        ))}
        {/* steps */}
        <rect x="188" y="206" width="144" height="8" rx="3" fill="#C7D6F5" />
        <rect x="180" y="214" width="160" height="8" rx="3" fill="#B4C8F0" />
      </g>

      {/* ground line */}
      <rect x="0" y="222" width="520" height="8" rx="4" fill="#DCE6FA" />

      {/* people */}
      <g>
        {[
          { x: 150, c: "#4F46E5" },
          { x: 262, c: "#3B82F6" },
          { x: 372, c: "#6366F1" },
        ].map((p) => (
          <g key={`p${p.x}`}>
            <circle cx={p.x} cy={200} r="6" fill={p.c} />
            <path
              d={`M${p.x - 7} 222 q7 -14 14 0 z`}
              fill={p.c}
            />
          </g>
        ))}
      </g>
    </Box>
  );
}
