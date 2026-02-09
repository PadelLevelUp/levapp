import { useEffect, useState } from "react";

type VV = { height: number; offsetTop: number };

export function useVisualViewport() {
  const [vv, setVv] = useState<VV>(() => ({
    height: typeof window !== "undefined" ? window.innerHeight : 0,
    offsetTop: 0,
  }));

  useEffect(() => {
    const v = window.visualViewport;
    if (!v) {
      const onResize = () =>
        setVv({ height: window.innerHeight, offsetTop: 0 });
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }

    const update = () => {
      setVv({
        height: Math.round(v.height),
        offsetTop: Math.round(v.offsetTop),
      });
    };

    update();
    v.addEventListener("resize", update);
    v.addEventListener("scroll", update);
    window.addEventListener("orientationchange", update);

    return () => {
      v.removeEventListener("resize", update);
      v.removeEventListener("scroll", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return vv;
}
