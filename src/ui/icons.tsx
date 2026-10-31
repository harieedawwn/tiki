import type { ComponentChildren, SVGAttributes } from 'preact';

type P = { size?: number } & SVGAttributes<SVGSVGElement>;

function Svg({ size = 24, children, ...rest }: P & { children: ComponentChildren }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={2.25}
      stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const IconPlay = (p: P) => <Svg {...p}><path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none" /></Svg>;
export const IconPlus = (p: P) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const IconX = (p: P) => <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const IconCheck = (p: P) => <Svg {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
export const IconBack = (p: P) => <Svg {...p}><path d="M15 5l-7 7 7 7" /></Svg>;
export const IconSearch = (p: P) => <Svg {...p}><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l5 5" /></Svg>;
export const IconSettings = (p: P) => (
  <Svg {...p}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><rect x="14" y="4.5" width="4" height="5" /><rect x="8" y="14.5" width="4" height="5" /></Svg>
);
export const IconDownload = (p: P) => <Svg {...p}><path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" /></Svg>;
export const IconUpload = (p: P) => <Svg {...p}><path d="M12 16V5M7 9.5l5-5 5 5M5 20h14" /></Svg>;
export const IconWrench = (p: P) => (
  <Svg {...p}><path d="M14.5 4.5a4.5 4.5 0 0 0 4.9 6.2L20 11l-9 9-3-3 9-9 .3.6a4.5 4.5 0 0 1-2.8-4.1z" /><path d="M4 20l3-3" /></Svg>
);
export const IconLock = (p: P) => <Svg {...p}><rect x="5" y="11" width="14" height="9" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Svg>;
export const IconFolder = (p: P) => <Svg {...p}><path d="M3 6h7l2 2h9v11H3z" /></Svg>;
export const IconMusic = (p: P) => <Svg {...p}><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></Svg>;
export const IconLink = (p: P) => <Svg {...p}><path d="M10 14l4-4M8.5 11.5L6 14a3.5 3.5 0 0 0 5 5l2.5-2.5M15.5 12.5L18 10a3.5 3.5 0 0 0-5-5l-2.5 2.5" /></Svg>;
export const IconForward = (p: P) => <Svg {...p}><path d="M9 5l7 7-7 7" /></Svg>;
export const IconFlame = (p: P) => <Svg {...p}><path d="M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-4 2-7 2 1 3 3 3 5 1-2 1-6 1-9z" /></Svg>;
export const IconShare = (p: P) => <Svg {...p}><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M8.3 10.8l7.4-3.6M8.3 13.2l7.4 3.6" /></Svg>;
export const IconMore = (p: P) => (
  <Svg {...p}><rect x="10.5" y="4" width="3" height="3" fill="currentColor" stroke="none" /><rect x="10.5" y="10.5" width="3" height="3" fill="currentColor" stroke="none" /><rect x="10.5" y="17" width="3" height="3" fill="currentColor" stroke="none" /></Svg>
);
export const IconUp = (p: P) => <Svg {...p}><path d="M12 5l7 9H5z" fill="currentColor" stroke="none" /></Svg>;
export const IconDown = (p: P) => <Svg {...p}><path d="M12 19l7-9H5z" fill="currentColor" stroke="none" /></Svg>;
export const IconUsers = (p: P) => <Svg {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.5c2 .8 3.5 2.8 3.5 5.5" /></Svg>;
export const IconPause = (p: P) => <Svg {...p}><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" stroke="none" /></Svg>;
export const IconSkip = (p: P) => <Svg {...p}><path d="M5 5l9 7-9 7z" fill="currentColor" stroke="none" /><path d="M18 5v14" /></Svg>;
export const IconWifiOff = (p: P) => <Svg {...p}><path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5-2.7M14.5 10.4A10 10 0 0 1 19 13M2 9.5a14.5 14.5 0 0 1 4.3-2.6M11 6.1a14.5 14.5 0 0 1 11 3.4" /><circle cx="12" cy="20" r="0.8" fill="currentColor" /></Svg>;
