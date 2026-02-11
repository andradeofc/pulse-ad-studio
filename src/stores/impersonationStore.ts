import { create } from 'zustand';

interface ImpersonatedUser {
  id: string;
  email: string;
  name: string;
  plan: string;
}

interface ImpersonationState {
  isImpersonating: boolean;
  impersonatedUser: ImpersonatedUser | null;
  adminAccessToken: string | null;
  adminRefreshToken: string | null;
  expiresAt: number | null;
  startImpersonation: (user: ImpersonatedUser, adminAccessToken: string, adminRefreshToken: string) => void;
  stopImpersonation: () => { accessToken: string; refreshToken: string } | null;
  checkExpiration: () => boolean;
}

const IMPERSONATION_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const STORAGE_KEY = 'impersonation_state';

// Load from sessionStorage (survives page refresh but not tab close)
function loadState(): Partial<ImpersonationState> {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored);
    // Check if expired
    if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
      sessionStorage.removeItem(STORAGE_KEY);
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

function saveState(state: Pick<ImpersonationState, 'isImpersonating' | 'impersonatedUser' | 'adminAccessToken' | 'adminRefreshToken' | 'expiresAt'>) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

function clearState() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

const initial = loadState();

export const useImpersonationStore = create<ImpersonationState>()((set, get) => ({
  isImpersonating: initial.isImpersonating || false,
  impersonatedUser: (initial as any).impersonatedUser || null,
  adminAccessToken: (initial as any).adminAccessToken || null,
  adminRefreshToken: (initial as any).adminRefreshToken || null,
  expiresAt: (initial as any).expiresAt || null,

  startImpersonation: (user, adminAccessToken, adminRefreshToken) => {
    const expiresAt = Date.now() + IMPERSONATION_DURATION_MS;
    const newState = {
      isImpersonating: true,
      impersonatedUser: user,
      adminAccessToken,
      adminRefreshToken,
      expiresAt,
    };
    set(newState);
    saveState(newState);
  },

  stopImpersonation: () => {
    const { adminAccessToken, adminRefreshToken } = get();
    const tokens = adminAccessToken && adminRefreshToken
      ? { accessToken: adminAccessToken, refreshToken: adminRefreshToken }
      : null;
    
    set({
      isImpersonating: false,
      impersonatedUser: null,
      adminAccessToken: null,
      adminRefreshToken: null,
      expiresAt: null,
    });
    clearState();
    
    return tokens;
  },

  checkExpiration: () => {
    const { expiresAt, isImpersonating } = get();
    if (!isImpersonating || !expiresAt) return false;
    if (Date.now() > expiresAt) {
      return true; // caller should handle stopping
    }
    return false;
  },
}));
