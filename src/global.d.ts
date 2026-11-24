export {};

declare global {
  interface Window {
    /**
     * True once the preloader has handed over. The hero's reveal listens for
     * `dd:ready`, and this flag lets anything that mounts after the event still
     * tell that the page is ready instead of waiting for a signal already sent.
     */
    __ddReady?: boolean;
  }
}
