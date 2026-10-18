// The installed AOS package does not ship TypeScript declarations.
declare module 'aos' {
  interface AosOptions {
    duration?: number;
    easing?: string;
    once?: boolean;
    mirror?: boolean;
    offset?: number;
    disableMutationObserver?: boolean;
  }

  const AOS: {
    init(options?: AosOptions): void;
    refresh(): void;
    refreshHard(): void;
  };
  export default AOS;
}
