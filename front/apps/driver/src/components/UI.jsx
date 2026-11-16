export function StatusBar() {
  // Espace de respiration en haut de l'écran (encoche des téléphones incluse)
  return <div style={{ height: 'calc(env(safe-area-inset-top, 0px) + 14px)', flexShrink: 0 }} />;
}

export function Spinner({ size = 28, color = 'var(--emerald)' }) {
  return (
    <div className="spin-keep" style={{
      width: size, height: size,
      borderRadius: '50%',
      border: `3px solid var(--emerald-light)`,
      borderTopColor: color,
      animation: 'spin 0.8s linear infinite',
      flexShrink: 0,
    }} />
  );
}
