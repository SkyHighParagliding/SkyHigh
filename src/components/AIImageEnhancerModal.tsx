import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Upload, X, RotateCcw, Check, Loader2, ImageIcon, Crop, ZoomIn } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export interface SliderData {
  sliderLg?: string;
  sliderSm?: string;
  sliderPortrait?: string;
}

interface AIImageEnhancerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: (wideImage: string, bannerImage?: string, name?: string, sliderData?: SliderData) => void;
  existingHeroImages?: string[];
  imageName?: string;
  onImageNameChange?: (name: string) => void;
  preloadedImage?: { base64: string; mimeType: string; name: string } | null;
  initialPhotographerCredit?: string;
  onPhotographerCreditChange?: (credit: string) => void;
  initialHeroImage?: string;
}

type CropStep = {
  key: string;
  label: string;
  targetW: number;
  targetH: number;
  prefix: string;
  resultKey: keyof SliderData | "banner";
  buttonLabel: string;
  hasZoom: boolean;
};

const CROP_STEPS: CropStep[] = [
  { key: "banner",    label: "Banner (1920×600)",         targetW: 1920, targetH: 600, prefix: "banner",           resultKey: "banner",          buttonLabel: "Save Banner",          hasZoom: false },
  { key: "slider-lg", label: "Landscape Large (600×400)", targetW: 600,  targetH: 400, prefix: "slider-lg",        resultKey: "sliderLg",        buttonLabel: "Save Landscape Large", hasZoom: true },
  { key: "slider-sm", label: "Landscape Small (450×300)", targetW: 450,  targetH: 300, prefix: "slider-sm",        resultKey: "sliderSm",        buttonLabel: "Save Landscape Small", hasZoom: true },
  { key: "portrait",  label: "Portrait (267×400)",        targetW: 267,  targetH: 400, prefix: "slider-portrait",  resultKey: "sliderPortrait",  buttonLabel: "Save Portrait",        hasZoom: true },
];

export function AIImageEnhancerModal({ isOpen, onClose, onAccept, existingHeroImages = [], imageName, onImageNameChange, preloadedImage, initialPhotographerCredit, onPhotographerCreditChange, initialHeroImage }: AIImageEnhancerModalProps) {
  const { token } = useAuth();
  const [step, setStep] = useState<"upload" | "generating" | "preview" | "crop-wizard">("upload");
  
  useEffect(() => {
    if (isOpen && initialHeroImage) {
      const nameMatch = initialHeroImage.match(/hero-(.*?)-/);
      const extractedName = nameMatch ? nameMatch[1].replace(/_/g, " ") : (imageName || "");
      if (onImageNameChange && !imageName) onImageNameChange(extractedName);
      enterCropWizard(initialHeroImage, extractedName);
    }
  }, [isOpen, initialHeroImage]);
  const [sourcePreview, setSourcePreview] = useState<string>("");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [resultImage, setResultImage] = useState<string>("");
  const [resultMimeType, setResultMimeType] = useState<string>("image/png");
  const [prompt, setPrompt] = useState("");
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [rotation, setRotation] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropPos, setCropPos] = useState<{x: number, y: number}>({x: 0.5, y: 0.5});
  const [displayDims, setDisplayDims] = useState<{w: number, h: number} | null>(null);
  const imgDisplayRef = useRef<HTMLImageElement>(null);
  const [photographerCredit, setPhotographerCredit] = useState(initialPhotographerCredit || "");
  const [watermarkSize, setWatermarkSize] = useState(10);
  const [watermarkPosition, setWatermarkPosition] = useState<string>("bottom-right");

  const [heroImagePath, setHeroImagePath] = useState<string>("");
  const [cropStepIndex, setCropStepIndex] = useState(0);
  const [wizardCropPos, setWizardCropPos] = useState<{x: number, y: number}>({x: 0.5, y: 0.5});
  const [wizardZoom, setWizardZoom] = useState(1);
  const [wizardImgDims, setWizardImgDims] = useState<{w: number, h: number} | null>(null);
  const wizardImgRef = useRef<HTMLImageElement>(null);
  const heroWatermarkedRef = useRef(false);
  const [wizardProcessing, setWizardProcessing] = useState(false);
  const [bannerResult, setBannerResult] = useState<string>("");
  const [sliderResults, setSliderResults] = useState<SliderData>({});
  const [savedName, setSavedName] = useState<string>("");

  useEffect(() => {
    if (isOpen) {
      fetch("/api/ai/image-prompt")
        .then(r => r.json())
        .then(data => setPrompt(data.prompt || ""))
        .catch(() => {});
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && preloadedImage) {
      const dataUrl = `data:${preloadedImage.mimeType};base64,${preloadedImage.base64}`;
      setSourcePreview(dataUrl);
      const byteChars = atob(preloadedImage.base64);
      const byteArray = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
      const blob = new Blob([byteArray], { type: preloadedImage.mimeType });
      const file = new File([blob], preloadedImage.name, { type: preloadedImage.mimeType });
      setSourceFile(file);
      setStep("upload");
      if (onImageNameChange) onImageNameChange(preloadedImage.name.replace(/\.[^/.]+$/, ""));
    }
  }, [isOpen, preloadedImage]);

  useEffect(() => {
    if (isOpen && initialPhotographerCredit) {
      setPhotographerCredit(initialPhotographerCredit);
    }
  }, [isOpen, initialPhotographerCredit]);

  const reset = () => {
    setStep("upload");
    setSourcePreview("");
    setSourceFile(null);
    setResultImage("");
    setError("");
    setProcessing(false);
    setShowPromptEditor(false);
    setRotation(0);
    setPhotographerCredit("");
    setWatermarkSize(10);
    setWatermarkPosition("bottom-right");
    heroWatermarkedRef.current = false;
    setCropPos({x: 0.5, y: 0.5});
    setDisplayDims(null);
    setHeroImagePath("");
    setCropStepIndex(0);
    setWizardCropPos({x: 0.5, y: 0.5});
    setWizardZoom(1);
    setWizardImgDims(null);
    setWizardProcessing(false);
    setBannerResult("");
    setSliderResults({});
    setSavedName("");
  };

  const handleClose = async () => {
    if (step === "crop-wizard" && heroImagePath) {
      if (photographerCredit && !heroWatermarkedRef.current) {
        heroWatermarkedRef.current = true;
        try {
          await fetch("/api/ai/watermark-existing", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ imagePath: heroImagePath, photographerCredit, watermarkSize, watermarkPosition }),
          });
        } catch {}
      }
      onAccept(heroImagePath, bannerResult || undefined, savedName, sliderResults);
    }
    reset();
    onClose();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSourceFile(file);
    setError("");
    setCropPos({x: 0.5, y: 0.5});
    setDisplayDims(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setSourcePreview(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleImageLoad = () => {
    requestAnimationFrame(() => {
      if (imgDisplayRef.current) {
        setDisplayDims({
          w: imgDisplayRef.current.clientWidth,
          h: imgDisplayRef.current.clientHeight
        });
      }
    });
  };

  const getCropLayout = () => {
    if (!displayDims) return null;
    const imgAspect = displayDims.w / displayDims.h;
    const cropAspect = 16 / 9;
    let cropW: number, cropH: number;
    if (imgAspect > cropAspect) {
      cropH = displayDims.h;
      cropW = cropH * cropAspect;
    } else {
      cropW = displayDims.w;
      cropH = cropW / cropAspect;
    }
    const maxDragX = displayDims.w - cropW;
    const maxDragY = displayDims.h - cropH;
    const cropLeft = cropPos.x * maxDragX;
    const cropTop = cropPos.y * maxDragY;
    const canDrag = maxDragX > 2 || maxDragY > 2;
    return { cropW, cropH, cropLeft, cropTop, maxDragX, maxDragY, canDrag };
  };

  const getCropRegion = () => {
    if (!displayDims) return undefined;
    const layout = getCropLayout();
    if (!layout) return undefined;
    return {
      x: layout.cropLeft / displayDims.w,
      y: layout.cropTop / displayDims.h,
      w: layout.cropW / displayDims.w,
      h: layout.cropH / displayDims.h,
    };
  };

  const handleCropDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const layout = getCropLayout();
    if (!layout || !layout.canDrag) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const startState = {
      mouseX: clientX, mouseY: clientY,
      startX: cropPos.x, startY: cropPos.y,
      maxDragX: layout.maxDragX, maxDragY: layout.maxDragY,
    };
    const handleMove = (ev: MouseEvent | TouchEvent) => {
      ev.preventDefault();
      const cx = 'touches' in ev ? (ev as TouchEvent).touches[0].clientX : (ev as MouseEvent).clientX;
      const cy = 'touches' in ev ? (ev as TouchEvent).touches[0].clientY : (ev as MouseEvent).clientY;
      const newX = startState.maxDragX > 0
        ? Math.max(0, Math.min(1, startState.startX + (cx - startState.mouseX) / startState.maxDragX))
        : 0.5;
      const newY = startState.maxDragY > 0
        ? Math.max(0, Math.min(1, startState.startY + (cy - startState.mouseY) / startState.maxDragY))
        : 0.5;
      setCropPos({ x: newX, y: newY });
    };
    const handleEnd = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd);
  };

  const handleGenerate = async () => {
    if (!sourceFile) return;
    setStep("generating");
    setError("");
    setResultImage("");

    try {
      const formData = new FormData();
      formData.append("image", sourceFile);
      formData.append("prompt", prompt);
      if (rotation !== 0) formData.append("rotation", String(rotation));
      const region = getCropRegion();
      if (region) formData.append("cropRegion", JSON.stringify(region));

      const res = await fetch("/api/ai/enhance-image", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Enhancement failed");

      setResultImage(`data:${data.mimeType};base64,${data.image}`);
      setResultMimeType(data.mimeType);
      setStep("preview");
    } catch (e: any) {
      setError(e.message || "Failed to enhance image");
      setStep("upload");
    }
  };

  const handleRetry = () => {
    setResultImage("");
    setError("");
    setStep("upload");
  };

  const enterCropWizard = (heroPath: string, name: string) => {
    setHeroImagePath(heroPath);
    setSavedName(name);
    setCropStepIndex(0);
    setWizardCropPos({x: 0.5, y: 0.5});
    setWizardZoom(1);
    setWizardImgDims(null);
    setBannerResult("");
    setSliderResults({});
    setStep("crop-wizard");
    setProcessing(false);
  };

  const handleAccept = async () => {
    setProcessing(true);
    setError("");

    try {
      const base64Data = resultImage.split(",")[1];

      const res = await fetch("/api/ai/process-image", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ image: base64Data, mimeType: resultMimeType, name: imageName, photographerCredit, watermarkSize, watermarkPosition })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Processing failed");

      enterCropWizard(data.wideImage, imageName || "");
    } catch (e: any) {
      setError(e.message || "Failed to process image");
      setProcessing(false);
    }
  };

  const handleUseOriginal = async () => {
    if (!sourceFile) return;
    setStep("generating");
    setError("");
    setProcessing(true);

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = (ev) => resolve((ev.target?.result as string).split(",")[1]);
        reader.onerror = () => reject(new Error("Failed to read file"));
      });
      reader.readAsDataURL(sourceFile);
      const base64Data = await base64Promise;

      const res = await fetch("/api/ai/process-image", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ image: base64Data, mimeType: sourceFile.type, rotation: rotation !== 0 ? rotation : undefined, cropRegion: getCropRegion(), name: imageName, photographerCredit, watermarkSize, watermarkPosition })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Processing failed");

      enterCropWizard(data.wideImage, imageName || "");
    } catch (e: any) {
      setError(e.message || "Failed to process image");
      setStep("upload");
      setProcessing(false);
    }
  };

  const handleSavePrompt = async () => {
    try {
      await fetch("/api/ai/image-prompt", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prompt })
      });
      setShowPromptEditor(false);
    } catch (e) {}
  };

  const currentCropStep = CROP_STEPS[cropStepIndex];

  const getWizardCropLayout = useCallback(() => {
    if (!wizardImgDims || !currentCropStep) return null;
    const imgW = wizardImgDims.w;
    const imgH = wizardImgDims.h;
    const targetAspect = currentCropStep.targetW / currentCropStep.targetH;

    if (!currentCropStep.hasZoom) {
      const cropW = imgW;
      const cropH = cropW / targetAspect;
      if (cropH > imgH) return null;
      const maxDragY = imgH - cropH;
      const cropTop = wizardCropPos.y * maxDragY;
      return { cropW, cropH, cropLeft: 0, cropTop, maxDragX: 0, maxDragY, canDrag: maxDragY > 2 };
    }

    let maxCropW: number, maxCropH: number;
    const imgAspect = imgW / imgH;
    if (imgAspect > targetAspect) {
      maxCropH = imgH;
      maxCropW = maxCropH * targetAspect;
    } else {
      maxCropW = imgW;
      maxCropH = maxCropW / targetAspect;
    }

    const cropW = maxCropW * wizardZoom;
    const cropH = maxCropH * wizardZoom;

    const maxDragX = imgW - cropW;
    const maxDragY = imgH - cropH;
    const cropLeft = wizardCropPos.x * Math.max(0, maxDragX);
    const cropTop = wizardCropPos.y * Math.max(0, maxDragY);

    return { cropW, cropH, cropLeft, cropTop, maxDragX: Math.max(0, maxDragX), maxDragY: Math.max(0, maxDragY), canDrag: maxDragX > 2 || maxDragY > 2 };
  }, [wizardImgDims, currentCropStep, wizardCropPos, wizardZoom]);

  const getWizardCropRegion = () => {
    if (!wizardImgDims) return undefined;
    const layout = getWizardCropLayout();
    if (!layout) return undefined;
    return {
      x: layout.cropLeft / wizardImgDims.w,
      y: layout.cropTop / wizardImgDims.h,
      w: layout.cropW / wizardImgDims.w,
      h: layout.cropH / wizardImgDims.h,
    };
  };

  const handleWizardDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const layout = getWizardCropLayout();
    if (!layout || !layout.canDrag) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const startState = {
      mouseX: clientX, mouseY: clientY,
      startX: wizardCropPos.x, startY: wizardCropPos.y,
      maxDragX: layout.maxDragX, maxDragY: layout.maxDragY,
    };
    const handleMove = (ev: MouseEvent | TouchEvent) => {
      ev.preventDefault();
      const cx = 'touches' in ev ? (ev as TouchEvent).touches[0].clientX : (ev as MouseEvent).clientX;
      const cy = 'touches' in ev ? (ev as TouchEvent).touches[0].clientY : (ev as MouseEvent).clientY;
      const newX = startState.maxDragX > 0
        ? Math.max(0, Math.min(1, startState.startX + (cx - startState.mouseX) / startState.maxDragX))
        : 0.5;
      const newY = startState.maxDragY > 0
        ? Math.max(0, Math.min(1, startState.startY + (cy - startState.mouseY) / startState.maxDragY))
        : 0.5;
      setWizardCropPos({ x: newX, y: newY });
    };
    const handleEnd = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd);
  };

  const handleWizardImageLoad = () => {
    requestAnimationFrame(() => {
      if (wizardImgRef.current) {
        setWizardImgDims({
          w: wizardImgRef.current.clientWidth,
          h: wizardImgRef.current.clientHeight
        });
      }
    });
  };

  const collectedRef = useRef<{ banner: string; sliders: SliderData }>({ banner: "", sliders: {} });

  useEffect(() => {
    collectedRef.current = { banner: bannerResult, sliders: sliderResults };
  }, [bannerResult, sliderResults]);

  const handleWizardSave = async () => {
    if (!currentCropStep || !heroImagePath) return;
    setWizardProcessing(true);
    setError("");

    try {
      const cropRegion = getWizardCropRegion();
      if (!cropRegion) {
        setError("Could not determine crop region. Please ensure the image is fully loaded.");
        setWizardProcessing(false);
        return;
      }
      let newBanner = bannerResult;
      let newSliders = { ...sliderResults };

      if (currentCropStep.key === "banner") {
        const layout = getWizardCropLayout();
        if (layout && wizardImgDims) {
          const scaleY = 1080 / wizardImgDims.h;
          const realCropY = layout.cropTop * scaleY;

          const res = await fetch("/api/ai/crop-banner", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ imagePath: heroImagePath, cropY: realCropY, name: savedName, photographerCredit, watermarkSize, watermarkPosition }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Banner crop failed");
          newBanner = data.bannerImage;
          setBannerResult(newBanner);
        }
      } else {
        const res = await fetch("/api/ai/crop-single", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            imagePath: heroImagePath,
            cropRegion,
            targetWidth: currentCropStep.targetW,
            targetHeight: currentCropStep.targetH,
            prefix: currentCropStep.prefix,
            name: savedName,
            photographerCredit,
            watermarkSize,
            watermarkPosition,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Crop failed");

        if (currentCropStep.resultKey !== "banner") {
          newSliders = { ...newSliders, [currentCropStep.resultKey]: data.image };
          setSliderResults(newSliders);
        }
      }

      advanceWizard(newBanner, newSliders);
    } catch (e: any) {
      setError(e.message || "Failed to save crop");
    }
    setWizardProcessing(false);
  };

  const advanceWizard = async (latestBanner?: string, latestSliders?: SliderData) => {
    const nextIndex = cropStepIndex + 1;
    if (nextIndex >= CROP_STEPS.length) {
      if (photographerCredit && heroImagePath && !heroWatermarkedRef.current) {
        heroWatermarkedRef.current = true;
        try {
          await fetch("/api/ai/watermark-existing", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ imagePath: heroImagePath, photographerCredit, watermarkSize, watermarkPosition }),
          });
        } catch {}
      }
      const finalBanner = latestBanner ?? collectedRef.current.banner;
      const finalSliders = latestSliders ?? collectedRef.current.sliders;
      onAccept(heroImagePath, finalBanner || undefined, savedName, finalSliders);
      reset();
      onClose();
    } else {
      setCropStepIndex(nextIndex);
      setWizardCropPos({x: 0.5, y: 0.5});
      setWizardZoom(1);
    }
  };

  const handleWizardSkip = () => {
    advanceWizard();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-border-faint">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-sky/10 rounded-xl flex items-center justify-center">
              {step === "crop-wizard" ? <Crop className="w-5 h-5 text-sky" /> : <Sparkles className="w-5 h-5 text-sky" />}
            </div>
            <div>
              <h2 className="text-lg font-bold text-navy">
                {step === "crop-wizard" ? "Position Crop Areas" : "Smart Image Enhancer"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {step === "crop-wizard"
                  ? `Step ${cropStepIndex + 1} of ${CROP_STEPS.length} — ${currentCropStep?.label}`
                  : "Upload a photo — use as-is or Smart enhance — then save optimised versions"}
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-muted rounded-lg">
            <X className="w-5 h-5 text-foreground-faint" />
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {step === "upload" && (
            <div className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileSelect}
                className="hidden"
              />
              {!sourcePreview ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-border-subtle rounded-xl p-8 text-center cursor-pointer hover:border-sky/50 hover:bg-sky/5 transition-colors"
                >
                  <Upload className="w-12 h-12 text-foreground-ghost mx-auto" />
                  <p className="text-muted-foreground font-medium mt-3">Click to upload a photo</p>
                  <p className="text-xs text-foreground-faint mt-1">JPG, PNG up to 20MB</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative overflow-hidden rounded-lg bg-gray-900 flex items-center justify-center" style={{minHeight: 200}}>
                    <div className="relative inline-block leading-none">
                      <img
                        ref={imgDisplayRef}
                        src={sourcePreview}
                        alt="Source"
                        onLoad={handleImageLoad}
                        draggable={false}
                        className="block select-none"
                        style={{
                          maxHeight: 320,
                          maxWidth: '100%',
                          transform: `rotate(${rotation}deg)`,
                        }}
                      />
                      {displayDims && (() => {
                        const layout = getCropLayout();
                        if (!layout) return null;
                        return (
                          <div
                            onMouseDown={handleCropDragStart}
                            onTouchStart={handleCropDragStart}
                            className="absolute select-none"
                            style={{
                              left: layout.cropLeft,
                              top: layout.cropTop,
                              width: layout.cropW,
                              height: layout.cropH,
                              boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
                              border: '2px dashed rgba(255,255,255,0.8)',
                              cursor: layout.canDrag ? 'grab' : 'default',
                              zIndex: 10,
                            }}
                          >
                            {layout.canDrag && (
                              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <span className="bg-black/60 text-white text-xs px-2 py-1 rounded">Drag to reposition</span>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {displayDims ? (getCropLayout()?.canDrag ? "Position the 16:9 crop area over the best part of your photo" : "Photo matches the target aspect ratio") : "Loading preview..."}
                    </p>
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="text-xs text-sky hover:underline">Change photo</button>
                  </div>
                </div>
              )}

              {sourcePreview && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-foreground-secondary">Level Horizon</label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">{rotation > 0 ? "+" : ""}{rotation.toFixed(1)}°</span>
                      {rotation !== 0 && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setRotation(0); }}
                          className="text-xs text-sky hover:underline"
                        >Reset</button>
                      )}
                    </div>
                  </div>
                  <input
                    type="range"
                    min={-10}
                    max={10}
                    step={0.1}
                    value={rotation}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => { e.stopPropagation(); setRotation(parseFloat(e.target.value)); }}
                    className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-sky"
                  />
                  <div className="flex justify-between text-[10px] text-foreground-faint">
                    <span>-10°</span>
                    <span>0°</span>
                    <span>+10°</span>
                  </div>
                </div>
              )}

              {sourcePreview && onImageNameChange && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground-secondary">Site Name / Description <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={imageName || ""}
                    onChange={(e) => onImageNameChange(e.target.value)}
                    placeholder="e.g. Mystic Launch, Ben Nevis, Stanwell Park"
                    className="w-full p-2 border border-border rounded-md text-sm focus:ring-1 focus:ring-sky focus:border-sky"
                  />
                  <p className="text-[10px] text-foreground-faint">Used in the filename for easy identification (e.g. hero-Mystic_Launch-1920x1080.jpg)</p>
                </div>
              )}

              {sourcePreview && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground-secondary">Photographer Credit</label>
                  <input
                    type="text"
                    value={photographerCredit}
                    onChange={(e) => {
                      setPhotographerCredit(e.target.value);
                      onPhotographerCreditChange?.(e.target.value);
                    }}
                    placeholder="e.g. Jane Smith Photography"
                    maxLength={60}
                    className="w-full p-2 border border-border rounded-md text-sm focus:ring-1 focus:ring-sky focus:border-sky"
                  />
                  <p className="text-[10px] text-foreground-faint">Adds a small watermark (© name) to the bottom-right of all generated images</p>
                  {photographerCredit.trim() && (
                    <div className="mt-2">
                      <label className="text-xs font-medium text-foreground-secondary">Watermark Size: {watermarkSize}%</label>
                      <input
                        type="range"
                        min={5}
                        max={50}
                        value={watermarkSize}
                        onChange={(e) => setWatermarkSize(parseInt(e.target.value, 10))}
                        className="w-full h-1.5 mt-1 accent-sky-500"
                      />
                      <div className="flex justify-between text-[10px] text-foreground-faint">
                        <span>5% (subtle)</span>
                        <span>50% (large)</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <button
                  type="button"
                  onClick={() => setShowPromptEditor(!showPromptEditor)}
                  className="text-xs text-sky hover:underline"
                >
                  {showPromptEditor ? "Hide Prompt" : "Edit Prompt"}
                </button>
                {showPromptEditor && (
                  <div className="space-y-2 mt-2">
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      rows={4}
                      className="w-full p-3 border border-border rounded-lg text-sm font-mono focus:ring-1 focus:ring-sky focus:border-sky"
                    />
                    <div className="flex justify-end">
                      <Button type="button" size="sm" onClick={handleSavePrompt} className="bg-sky text-white text-xs">
                        Save as default
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  onClick={handleUseOriginal}
                  disabled={!sourceFile || (onImageNameChange != null && !(imageName || "").trim())}
                  className="flex-1 h-12 text-base bg-navy hover:bg-navy-light text-white"
                >
                  <ImageIcon className="w-5 h-5 mr-2" />
                  Use Original
                </Button>
                <Button
                  type="button"
                  onClick={handleGenerate}
                  disabled={!sourceFile || (onImageNameChange != null && !(imageName || "").trim())}
                  className="flex-1 bg-sky hover:bg-sky-light text-white h-12 text-base"
                >
                  <Sparkles className="w-5 h-5 mr-2" />
                  Smart Enhance
                </Button>
              </div>

              {existingHeroImages.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-foreground-secondary mb-2">Or use an existing hero image:</p>
                  <div className="grid grid-cols-3 gap-2">
                    {existingHeroImages.map((src, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          const nameMatch = src.match(/hero-(.*?)-/);
                          const extractedName = nameMatch ? nameMatch[1].replace(/_/g, " ") : (imageName || "");
                          if (onImageNameChange && !imageName) onImageNameChange(extractedName);
                          enterCropWizard(src, extractedName);
                        }}
                        className="relative border-2 border-border-subtle rounded-lg overflow-hidden aspect-video hover:border-sky transition-colors group text-left"
                      >
                        <img src={src} alt={`Hero ${i + 1}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        <div className="absolute inset-0 bg-navy/0 group-hover:bg-navy/40 transition-colors flex items-center justify-center">
                          <div className="text-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Crop className="w-6 h-6 text-white mx-auto mb-1" />
                            <span className="text-white text-xs font-medium">Create Banner / Sliders</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === "generating" && (
            <div className="py-16 text-center space-y-4">
              <Loader2 className="w-12 h-12 text-sky mx-auto animate-spin" />
              <p className="text-navy font-medium">{processing ? "Resizing and optimising your photo..." : "Enhancing your photo..."}</p>
              <p className="text-sm text-foreground-faint">{processing ? "Creating optimised versions" : "This may take 15-30 seconds"}</p>
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2 text-center">Original</p>
                  <img src={sourcePreview} alt="Original" className="w-full rounded-lg object-cover h-48" />
                </div>
                <div>
                  <p className="text-sm font-medium text-sky mb-2 text-center">Smart Enhanced</p>
                  <img src={resultImage} alt="Enhanced" className="w-full rounded-lg object-cover h-48" />
                </div>
              </div>

              <div className="bg-background rounded-lg p-3 text-xs text-muted-foreground">
                <p className="font-medium text-navy text-center">Accepting will create a 1920x1080 hero image, then guide you through positioning crops for banner, landscape and portrait sizes.</p>
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRetry}
                  className="flex-1 h-12 border-border text-foreground-secondary"
                  disabled={processing}
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reject &amp; Retry
                </Button>
                <Button
                  type="button"
                  onClick={handleAccept}
                  className="flex-1 h-12 bg-emerald-500 hover:bg-emerald-600 text-white"
                  disabled={processing}
                >
                  {processing ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4 mr-2" />
                  )}
                  {processing ? "Processing..." : "Accept & Save Hero"}
                </Button>
              </div>
            </div>
          )}

          {step === "crop-wizard" && currentCropStep && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                {CROP_STEPS.map((s, i) => (
                  <div
                    key={s.key}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${
                      i < cropStepIndex ? "bg-emerald-400" : i === cropStepIndex ? "bg-sky" : "bg-border"
                    }`}
                  />
                ))}
              </div>

              <div className="relative overflow-hidden rounded-lg bg-gray-900 flex items-center justify-center" style={{minHeight: 250}}>
                <div className="relative inline-block leading-none">
                  <img
                    ref={wizardImgRef}
                    src={heroImagePath}
                    alt="Hero"
                    onLoad={handleWizardImageLoad}
                    draggable={false}
                    className="block select-none"
                    style={{
                      maxHeight: 400,
                      maxWidth: '100%',
                    }}
                  />
                  {wizardImgDims && (() => {
                    const layout = getWizardCropLayout();
                    if (!layout) return null;
                    return (
                      <div
                        onMouseDown={handleWizardDragStart}
                        onTouchStart={handleWizardDragStart}
                        className="absolute select-none"
                        style={{
                          left: layout.cropLeft,
                          top: layout.cropTop,
                          width: layout.cropW,
                          height: layout.cropH,
                          boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
                          border: '2px dashed rgba(255,255,255,0.8)',
                          cursor: layout.canDrag ? 'grab' : 'default',
                          zIndex: 10,
                        }}
                      >
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className="bg-black/60 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                            {layout.canDrag ? "Drag to reposition" : currentCropStep.label}
                          </span>
                        </div>
                        {photographerCredit.trim() && (
                          <div
                            className="absolute pointer-events-none"
                            style={{
                              ...(watermarkPosition.endsWith("right") ? { right: 6 } : watermarkPosition.endsWith("center") ? { left: '50%', transform: 'translateX(-50%)' } : { left: 6 }),
                              ...(watermarkPosition.startsWith("bottom") ? { bottom: 4 } : { top: 4 }),
                              ...(watermarkPosition.endsWith("right") ? { textAlign: 'right' as const } : watermarkPosition.endsWith("center") ? { textAlign: 'center' as const } : { textAlign: 'left' as const }),
                            }}
                          >
                            <span
                              className="whitespace-nowrap font-semibold"
                              style={{
                                fontSize: Math.max(8, Math.round(layout.cropW * watermarkSize / 1000)),
                                color: 'rgba(255,255,255,0.85)',
                                textShadow: '1px 1px 2px rgba(0,0,0,0.6)',
                              }}
                            >
                              © {photographerCredit.trim()}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {currentCropStep.hasZoom
                    ? "Drag to position, use zoom slider to resize the crop area"
                    : "Drag the banner region up or down to choose the best slice"}
                </p>
                <p className="text-xs font-medium text-foreground-secondary">
                  {currentCropStep.targetW}×{currentCropStep.targetH}
                </p>
              </div>

              {currentCropStep.hasZoom && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-foreground-secondary flex items-center gap-1">
                      <ZoomIn className="w-3.5 h-3.5" />
                      Crop Size
                    </label>
                    <span className="text-xs text-muted-foreground tabular-nums">{Math.round(wizardZoom * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.3}
                    max={1}
                    step={0.01}
                    value={wizardZoom}
                    onChange={(e) => setWizardZoom(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-sky"
                  />
                  <div className="flex justify-between text-[10px] text-foreground-faint">
                    <span>Tight crop</span>
                    <span>Full size</span>
                  </div>
                </div>
              )}

              {photographerCredit.trim() && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground-secondary">Watermark Position</label>
                  <div className="grid grid-cols-3 gap-1 w-48">
                    {([
                      ["top-left", "TL"], ["top-center", "TC"], ["top-right", "TR"],
                      ["bottom-left", "BL"], ["bottom-center", "BC"], ["bottom-right", "BR"],
                    ] as const).map(([pos, label]) => (
                      <button
                        key={pos}
                        type="button"
                        onClick={() => setWatermarkPosition(pos)}
                        className={`text-[10px] py-1 px-1.5 rounded border transition-colors ${
                          watermarkPosition === pos
                            ? "bg-sky text-white border-sky"
                            : "bg-background border-border text-foreground-secondary hover:border-sky/50"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-foreground-secondary">Size: {watermarkSize}%</label>
                    <input type="range" min={5} max={50} value={watermarkSize} onChange={(e) => setWatermarkSize(parseInt(e.target.value, 10))} className="flex-grow h-1.5 accent-sky-500" />
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleWizardSkip}
                  className="flex-1 h-10 border-border text-foreground-secondary"
                  disabled={wizardProcessing}
                >
                  Skip
                </Button>
                <Button
                  type="button"
                  onClick={handleWizardSave}
                  className="flex-1 h-10 bg-navy hover:bg-navy-light text-white"
                  disabled={wizardProcessing}
                >
                  {wizardProcessing ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4 mr-2" />
                  )}
                  {wizardProcessing ? "Saving..." : currentCropStep.buttonLabel}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
