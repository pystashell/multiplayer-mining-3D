const WEB_PROFILE = Object.freeze({
  distribution: 'web',
  multiplayerEnabled: true,
  steamworksEnabled: false,
  multiplayerTransport: 'web',
});

export function resolveRuntimeProfile(runtime = globalThis.holoRuntime) {
  if (!runtime || typeof runtime !== 'object') return WEB_PROFILE;

  const capabilities = runtime.capabilities && typeof runtime.capabilities === 'object'
    ? runtime.capabilities
    : {};
  const distribution = runtime.distribution === 'steam' ? 'steam' : 'web';
  const multiplayerEnabled = capabilities.multiplayer !== false;

  return Object.freeze({
    distribution,
    multiplayerEnabled,
    steamworksEnabled: capabilities.steamworks === true,
    multiplayerTransport: multiplayerEnabled
      ? (capabilities.multiplayerTransport === 'steam' ? 'steam' : 'web')
      : 'none',
  });
}
