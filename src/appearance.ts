export type ColorMode = 'light' | 'dark';
export type Appearance = ColorMode | 'auto';
export const isAppearance = (value: unknown): value is Appearance => ['light', 'dark', 'auto'].includes(String(value));
export function resolveMode(choice: Appearance, system: ColorMode): ColorMode { return choice === 'auto' ? system : choice; }
