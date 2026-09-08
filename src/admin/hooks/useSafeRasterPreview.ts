import { useEffect, useState } from "react";
import { createSafeRasterPreview } from "../responsive-media";

type SafeRasterPreviewState = {
  url: string;
  loading: boolean;
  error: string;
};

const emptyPreview: SafeRasterPreviewState = { url: "", loading: false, error: "" };

/**
 * Decodes an operator-selected raster only after the bounded metadata preflight
 * and exposes an object URL for the generated WebP, never for the untrusted original.
 */
export function useSafeRasterPreview(file?: File): SafeRasterPreviewState {
  const [preview, setPreview] = useState<SafeRasterPreviewState>(emptyPreview);

  useEffect(() => {
    if (!file) {
      setPreview(emptyPreview);
      return;
    }

    const controller = new AbortController();
    let objectUrl = "";
    setPreview({ url: "", loading: true, error: "" });
    void createSafeRasterPreview(file, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(result.blob);
        setPreview({ url: objectUrl, loading: false, error: "" });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setPreview({
          url: "",
          loading: false,
          error: "Não foi possível gerar uma prévia segura desta imagem.",
        });
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  return preview;
}
