import { store } from './store';

/** The message shown at the top of the page until the next navigation. */
export const errorBanner = store('');

export const showError = (e: unknown) => errorBanner.set(e instanceof Error ? e.message : String(e));
