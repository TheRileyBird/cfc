import { getSession, startLogin, completeLogin, getBuyerLocations, LOCATION_KEY, type BuyerLocation } from './wholesale-core';

function setStatus(text: string): void {
  document.querySelectorAll<HTMLElement>('[data-wholesale-status]').forEach((status) => {
    status.textContent = text;
  });
  document.querySelectorAll<HTMLElement>('[data-wholesale-public-status]').forEach((status) => {
    status.textContent = text;
    status.classList.toggle('hidden', !text);
  });
}

function setHeroMode(hero: HTMLElement | null, mode: 'login' | 'account'): void {
  if (!hero) return;
  hero.classList.toggle('min-h-[calc(85vh-96px)]', mode === 'login');
  hero.classList.toggle('flex', mode === 'login');
  hero.classList.toggle('items-center', mode === 'login');
}

function showSignedOut(hero: HTMLElement | null, gate: HTMLElement | null, storeRegions: NodeListOf<HTMLElement>, message = ''): void {
  hero?.classList.remove('hidden');
  setHeroMode(hero, 'login');
  gate?.classList.remove('hidden');
  storeRegions.forEach((region) => region.classList.add('hidden'));
  setStatus(message);
}

function showSignedIn(hero: HTMLElement | null, gate: HTMLElement | null, storeRegions: NodeListOf<HTMLElement>): void {
  setHeroMode(hero, 'account');
  hero?.classList.add('hidden');
  gate?.classList.add('hidden');
  storeRegions.forEach((region) => region.classList.remove('hidden'));
}

async function initWholesaleLogin(): Promise<void> {
  const signInButton = document.querySelector<HTMLButtonElement>('[data-wholesale-login]');
  const gate = document.querySelector<HTMLElement>('[data-wholesale-gate]');
  const hero = document.querySelector<HTMLElement>('[data-wholesale-hero]');
  const storeRegions = document.querySelectorAll<HTMLElement>('[data-wholesale-store]');

  signInButton?.addEventListener('click', () => {
    startLogin().catch((error) => setStatus(error.message));
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

    showSignedOut(hero, gate, storeRegions);
    return;
  }

  showSignedIn(hero, gate, storeRegions);
  setStatus('Checking your wholesale account...');

  let locations: BuyerLocation[] = [];
  try {
    locations = await getBuyerLocations(session);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Wholesale is temporarily unavailable.';
    if (message.includes('session expired')) {
      showSignedOut(hero, gate, storeRegions, message);
      return;
    }
    throw error;
  }

  if (locations.length === 0) {
    setStatus('This email is signed in, but it is not assigned to a wholesale company location.');
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
