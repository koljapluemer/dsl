import type { LucideIcon } from 'lucide-react';

/** A single actionable tool in a canvas toolbar. */
export interface ToolbarAction {
  id: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
}
