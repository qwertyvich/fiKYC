// Shop limit for new provider QR links. Chat requisites use their own limits.
export const SBP_MAX_MINOR = 800_000;
export const withinSbpLimit = (minor: number) => Number.isSafeInteger(minor) && minor > 0 && minor <= SBP_MAX_MINOR;
