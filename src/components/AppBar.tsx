import { ReactNode } from 'react';

import { SecondaryHeader } from './SecondaryHeader';

type AppBarProps = {
  title?: string;
  subtitle?: string;
  initials?: string;
  onPressAvatar?: () => void;
  onBack?: () => void;
  right?: ReactNode;
};

/**
 * Legacy shim — forwards to SecondaryHeader. Phase 1 of the UI revamp retires
 * the navy hero AppBar. New screens should use SecondaryHeader directly.
 */
export function AppBar({ title, subtitle, onBack, right }: AppBarProps) {
  return (
    <SecondaryHeader
      title={title}
      subtitle={subtitle}
      onBack={onBack}
      right={right}
    />
  );
}
