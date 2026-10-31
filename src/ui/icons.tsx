import type { ComponentChildren, SVGAttributes } from 'preact';

type P = { size?: number } & SVGAttributes<SVGSVGElement>;

function Svg({ size = 24, children, ...rest }: P & { children: ComponentChildren }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={2}
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}
const F = { fill: 'currentColor', stroke: 'none' } as const;

export const IconPlay = (p: P) => <Svg {...p}><path d="M8 5.2v13.6a1 1 0 0 0 1.5.86l11-6.8a1 1 0 0 0 0-1.72l-11-6.8A1 1 0 0 0 8 5.2z" {...F} /></Svg>;
export const IconPlus = (p: P) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const IconX = (p: P) => <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const IconCheck = (p: P) => <Svg {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
export const IconBack = (p: P) => <Svg {...p}><path d="M15 5l-7 7 7 7" /></Svg>;
export const IconForward = (p: P) => <Svg {...p}><path d="M9 5l7 7-7 7" /></Svg>;
export const IconSearch = (p: P) => <Svg {...p}><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l5 5" /></Svg>;
export const IconSettings = (p: P) => (
  <Svg {...p}><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></Svg>
);
export const IconDownload = (p: P) => <Svg {...p}><path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" /></Svg>;
export const IconUpload = (p: P) => <Svg {...p}><path d="M12 16V5M7 9.5l5-5 5 5M5 20h14" /></Svg>;
export const IconWrench = (p: P) => (
  <Svg {...p}><path d="M14.5 4.5a4.5 4.5 0 0 0 4.9 6.2L20 11l-9 9-3-3 9-9 .3.6a4.5 4.5 0 0 1-2.8-4.1z" /><path d="M4 20l3-3" /></Svg>
);
export const IconLock = (p: P) => <Svg {...p}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Svg>;
export const IconFolder = (p: P) => <Svg {...p}><path d="M3 7a1 1 0 0 1 1-1h6l2 2h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" /></Svg>;
export const IconMusic = (p: P) => <Svg {...p}><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></Svg>;
export const IconLink = (p: P) => <Svg {...p}><path d="M10 14l4-4M8.5 11.5L6 14a3.5 3.5 0 0 0 5 5l2.5-2.5M15.5 12.5L18 10a3.5 3.5 0 0 0-5-5l-2.5 2.5" /></Svg>;
export const IconFlame = (p: P) => <Svg {...p}><path d="M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-4 2-7 2 1 3 3 3 5 1-2 1-6 1-9z" /></Svg>;
export const IconShare = (p: P) => <Svg {...p}><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M8.3 10.8l7.4-3.6M8.3 13.2l7.4 3.6" /></Svg>;
export const IconMore = (p: P) => (
  <Svg {...p}><circle cx="12" cy="5.5" r="1.6" {...F} /><circle cx="12" cy="12" r="1.6" {...F} /><circle cx="12" cy="18.5" r="1.6" {...F} /></Svg>
);
export const IconUp = (p: P) => <Svg {...p}><path d="M12 6l6 8H6z" {...F} /></Svg>;
export const IconDown = (p: P) => <Svg {...p}><path d="M12 18l6-8H6z" {...F} /></Svg>;
export const IconUsers = (p: P) => <Svg {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.5c2 .8 3.5 2.8 3.5 5.5" /></Svg>;
export const IconUser = (p: P) => <Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></Svg>;
export const IconPause = (p: P) => <Svg {...p}><rect x="6.5" y="5" width="4" height="14" rx="1.2" {...F} /><rect x="13.5" y="5" width="4" height="14" rx="1.2" {...F} /></Svg>;
export const IconSkip = (p: P) => <Svg {...p}><path d="M5 6.2v11.6a1 1 0 0 0 1.6.8l8-5.8a1 1 0 0 0 0-1.6l-8-5.8a1 1 0 0 0-1.6.8z" {...F} /><path d="M19 5v14" /></Svg>;
export const IconWifiOff = (p: P) => <Svg {...p}><path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5-2.7M14.5 10.4A10 10 0 0 1 19 13M2 9.5a14.5 14.5 0 0 1 4.3-2.6M11 6.1a14.5 14.5 0 0 1 11 3.4" /><circle cx="12" cy="20" r="0.8" {...F} /></Svg>;

// Game kinds
/** Cổ điển: headphones (listen to the opening). */
export const IconClassic = (p: P) => (
  <Svg {...p}><path d="M4 15v-3a8 8 0 0 1 16 0v3" /><path d="M4 14.5h2.5a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM20 14.5h-2.5a1 1 0 0 0-1 1V19a1 1 0 0 0 1 1H19a1 1 0 0 0 1-1z" /></Svg>
);
/** Đoạn bất kỳ: a die. */
export const IconRandom = (p: P) => (
  <Svg {...p}><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><circle cx="8.5" cy="8.5" r="1.4" {...F} /><circle cx="12" cy="12" r="1.4" {...F} /><circle cx="15.5" cy="15.5" r="1.4" {...F} /></Svg>
);
/** Nghe nhạc, chọn ảnh: a grid of covers with one picked. */
export const IconCoverPick = (p: P) => (
  <Svg {...p}><rect x="3.5" y="3.5" width="7" height="7" rx="1.8" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.8" {...F} /><rect x="3.5" y="13.5" width="7" height="7" rx="1.8" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.8" /></Svg>
);
/** Xem ảnh, chọn nhạc: a picture sending sound. */
export const IconSoundPick = (p: P) => (
  <Svg {...p}><rect x="2.5" y="5" width="12" height="14" rx="2" /><path d="M2.8 16l3.7-3.7 2.5 2.5 1.8-1.8 3.4 3.4" /><circle cx="10.5" cy="9" r="1.2" {...F} /><path d="M17.5 9.5a3.5 3.5 0 0 1 0 5M20 7a7 7 0 0 1 0 10" /></Svg>
);

// Match formats and flow
export const IconRounds = (p: P) => (
  <Svg {...p}><path d="M20 11a8 8 0 0 0-14.5-4.5M4 13a8 8 0 0 0 14.5 4.5" /><path d="M5 3v4h4M19 21v-4h-4" /></Svg>
);
export const IconFlag = (p: P) => <Svg {...p}><path d="M5 21V4" /><path d="M5 4h12l-2.5 4.5L17 13H5" /></Svg>;
export const IconElim = (p: P) => <Svg {...p}><circle cx="9.5" cy="8" r="3.5" /><path d="M3 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><path d="M16.5 10.5h5" /></Svg>;
export const IconAuto = (p: P) => <Svg {...p}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.8 2M9.5 2.5h5" /></Svg>;
export const IconHand = (p: P) => (
  <Svg {...p}><path d="M9 11.5V5a1.5 1.5 0 0 1 3 0v5.5M12 10V8.5a1.5 1.5 0 0 1 3 0v2.5M15 10.5a1.5 1.5 0 0 1 3 0v4a6.5 6.5 0 0 1-6.5 6.5h-.6a5 5 0 0 1-4-2L4.2 15.5a1.5 1.5 0 0 1 2.3-1.9L9 16" /></Svg>
);

export const IconEye = (p: P) => <Svg {...p}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Svg>;
export const IconVolume = (p: P) => <Svg {...p}><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></Svg>;
export const IconVolumeOff = (p: P) => <Svg {...p}><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M16 9.5l5 5M21 9.5l-5 5" /></Svg>;
export const IconPalette = (p: P) => (
  <Svg {...p}><path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1.3-1.1-1.6-1.1-2.7 0-.9.7-1.6 1.6-1.6H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z" /><circle cx="7.5" cy="11" r="1.3" {...F} /><circle cx="10.5" cy="7" r="1.3" {...F} /><circle cx="15.5" cy="7.5" r="1.3" {...F} /></Svg>
);
export const IconTrophy = (p: P) => (
  <Svg {...p}><path d="M8 4h8v6a4 4 0 0 1-8 0z" /><path d="M8 6H4.5a3 3 0 0 0 3.6 4.8M16 6h3.5a3 3 0 0 1-3.6 4.8M12 14v4M8.5 20.5h7" /></Svg>
);
export const IconTimer = (p: P) => <Svg {...p}><circle cx="12" cy="13" r="8" /><path d="M12 13V9M9.5 2.5h5" /></Svg>;
export const IconHeart = (p: P) => <Svg {...p}><path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 3c0 5.4-7.5 10-7.5 10z" /></Svg>;

/** App mark: a disc with a question mark and a short clip arc. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" class="logo-mark">
      <rect width="64" height="64" rx="16" fill="var(--surface-2)" />
      <circle cx="32" cy="33" r="19" fill="var(--accent)" />
      <path d="M44.7 13.4A23 23 0 0 1 54.3 25" fill="none" stroke="var(--good)" stroke-width="5" stroke-linecap="round" />
      <path d="M26.6 28.2a5.6 5.6 0 1 1 8 5c-1.8 1-2.6 2.2-2.6 4.2v.8" fill="none" stroke="var(--on-accent)" stroke-width="4.4" stroke-linecap="round" />
      <circle cx="32" cy="43.2" r="2.7" fill="var(--on-accent)" />
    </svg>
  );
}
