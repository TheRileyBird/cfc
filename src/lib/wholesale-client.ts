import { getSession, clearSession, startLogin, completeLogin, getBuyerLocations, LOCATION_KEY, type BuyerLocation } from './wholesale-core';

function setStatus(text: string): void {
  document.querySelectorAll<HTMLElement>('[data-wholesale-status]').forEach((status) => {
    status.textContent = text;
  });
  document.querySelectorAll<HTMLElement>('[data-wholesale-public-status]').forEach((status) => {
    status.textContent = text;
    status.classList.toggle('hidden', !text);
  });
}

// The gate, the store status, and the denied panel all live *inside* the hero
// section, so the hero itself stays visible in every state — hiding it blanks the
// page. Only the panels inside it are swapped.
function showPanel(
  panels: { gate: HTMLElement | null; store: NodeListOf<HTMLElement>; denied: HTMLElement | null },
  visible: 'gate' | 'store' | 'denied'
): void {
  panels.gate?.classList.toggle('hidden', visible !== 'gate');
  panels.store.forEach((region) => region.classList.toggle('hidden', visible !== 'store'));
  panels.denied?.classList.toggle('hidden', visible !== 'denied');
}

async function initWholesaleLogin(): Promise<void> {
  const signInButton = document.querySelector<HTMLButtonElement>('[data-wholesale-login]');
  const panels = {
    gate: document.querySelector<HTMLElement>('[data-wholesale-gate]'),
    store: document.querySelectorAll<HTMLElement>('[data-wholesale-store]'),
    denied: document.querySelector<HTMLElement>('[data-wholesale-denied]'),
  };

  signInButton?.addEventListener('click', () => {
    startLogin().catch((error) => setStatus(error.message));
  });

  document.querySelector<HTMLButtonElement>('[data-wholesale-signout]')?.addEventListener('click', () => {
    clearSession();
    window.location.assign('/wholesale');
  });

  const params = new URLSearchParams(window.location.search);
  let session = getSession();

  if (params.has('error')) {
    setStatus(params.get('error_description') ?? params.get('error') ?? 'Wholesale login could not be completed.');
    window.history.replaceState({}, document.title, '/wholesale');
  }

  if (params.has('code')) {
    setStatus('Finishing secure sign in...');
    session = await completeLogin(params.get('code') ?? '', params.get('state') ?? '');
  }

  if (!session) {
    if (params.get('company_location_changed') === 'true') {
      setStatus('Opening your wholesale catalog...');
      await startLogin();
      return;
    }

    showPanel(panels, 'gate');
    return;
  }

  showPanel(panels, 'store');
  setStatus('Checking your wholesale account...');

  let locations: BuyerLocation[] = [];
  try {
    locations = await getBuyerLocations(session);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Wholesale is temporarily unavailable.';
    if (message.includes('session expired')) {
      showPanel(panels, 'gate');
      setStatus(message);
      return;
    }
    throw error;
  }

  if (locations.length === 0) {
    showPanel(panels, 'denied');
    return;
  }

  const savedLocationId = localStorage.getItem(LOCATION_KEY);
  const location = locations.find((item) => item.id === savedLocationId) ?? locations[0];
  localStorage.setItem(LOCATION_KEY, location.id);

  setStatus('Redirecting to your wholesale catalog...');
  window.location.assign('/shop?filter=wholesale');
}

if (typeof window !== 'undefined') {
  initWholesaleLogin().catch((error) => setStatus(error instanceof Error ? error.message : 'Wholesale is temporarily unavailable.'));
}
