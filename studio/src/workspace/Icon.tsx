export function Icon({ name }: { name: 'save' | 'rebuild' | 'play' | 'search' | 'eye' | 'full' | 'focus' }) {
  const paths = {
    save: <><path d="M4 3h13l3 3v15H4z"/><path d="M8 3v6h8V3M8 21v-8h8v8"/></>,
    rebuild: <><path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5"/></>,
    play: <path d="m7 3 13 9-13 9z"/>, search: <><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></>,
    eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/></>,
    full: <path d="M9 3H3v6M15 3h6v6M3 15v6h6M21 15v6h-6"/>,
    focus: <><path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/><circle cx="12" cy="12" r="4"/></>,
  };
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

