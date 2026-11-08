export type ColorMode = 'light' | 'dark';
export type Appearance = ColorMode | 'auto';
// Legacy builds saved an automatic/default theme as if it was a manual choice.
// Only explicit selections made with this version override the light default.
export const APPEARANCE_STORAGE_KEY = 'appearance-v2';
export const isAppearance = (value: unknown): value is Appearance => typeof value === 'string' && ['light', 'dark', 'auto'].includes(value);
export function resolveMode(choice: Appearance, system: ColorMode): ColorMode { return choice === 'auto' ? system : choice; }
