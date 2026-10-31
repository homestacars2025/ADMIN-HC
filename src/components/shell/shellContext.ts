import { useOutletContext } from 'react-router-dom';
import type { CurrentProfile } from '../../hooks/useCurrentProfile';

export interface ShellContext {
  profile: CurrentProfile | null;
  reloadProfile: () => void;
  openNotifications: () => void;
}

export const useShell = () => useOutletContext<ShellContext>();
