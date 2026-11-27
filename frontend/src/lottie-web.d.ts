declare module "lottie-web" {
  const lottie: {
    loadAnimation(options: {
      container: HTMLElement;
      renderer: "svg" | "canvas" | "html";
      loop?: boolean;
      autoplay?: boolean;
      animationData?: unknown;
      rendererSettings?: Record<string, unknown>;
    }): { destroy: () => void };
  };
  export default lottie;
}
